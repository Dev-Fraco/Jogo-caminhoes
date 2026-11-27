import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.font.FontRenderContext;
import java.awt.font.GlyphVector;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;

/**
 * Gera a fonte de texto da interface (assets/hud2/texto.fnt + texto.png) a partir de uma TTF, em alta
 * resolução: no jogo é reduzida, então as letras ficam nítidas em qualquer tamanho. Cobre ASCII e os
 * acentos do português.
 *
 * Cada célula do atlas é do tamanho da TINTA do glifo (não só do avanço), então letras com gancho que
 * passa para a esquerda (como o J) não invadem a célula da vizinha.
 *
 * Uso (na pasta ferramentas/hud):
 *   java GerarFonteTexto.java <caminho-da-ttf> <pasta-de-saida>
 * Fonte usada: DejaVu Sans Condensed Bold (licença livre, ver assets/CREDITOS.md).
 */
public class GerarFonteTexto {
    static final float TAMANHO = 56f;
    static final int LARGURA = 1024;
    static final String CHARS;

    static {
        StringBuilder sb = new StringBuilder();
        for (char c = 32; c <= 126; c++) sb.append(c);
        sb.append("ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüçÑñ°ª º·•–—’“”«»");
        CHARS = sb.toString();
    }

    /** Medidas de um caractere: avanço, tinta à esquerda da origem (k) e largura da célula. */
    static final class Medida {
        int adv, k, cell;
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("uso: GerarFonteTexto <ttf> <saida>");
            System.exit(1);
        }
        Font base = Font.createFont(Font.TRUETYPE_FONT, new File(args[0])).deriveFont(TAMANHO);
        BufferedImage tmp = new BufferedImage(4, 4, BufferedImage.TYPE_INT_ARGB);
        Graphics2D gm = tmp.createGraphics();
        gm.setFont(base);
        FontMetrics fm = gm.getFontMetrics();
        FontRenderContext frc = gm.getFontRenderContext();
        int linha = fm.getHeight(), ascent = fm.getAscent();
        Medida[] med = medir(base, fm, frc, linha);
        int[][] pos = posicoes(med, linha);
        int altura = 0;
        for (int[] p : pos) altura = Math.max(altura, p[1] + linha + 2);
        int alturaPot = 1;
        while (alturaPot < altura) alturaPot *= 2;
        gm.dispose();

        BufferedImage atlas = desenhar(base, ascent, med, pos, alturaPot);

        File saida = new File(args[1]);
        saida.mkdirs();
        javax.imageio.ImageIO.write(atlas, "png", new File(saida, "texto.png"));
        try (Writer w = new OutputStreamWriter(new FileOutputStream(new File(saida, "texto.fnt")), "UTF-8")) {
            w.write("info face=\"DejaVuSansCondensed-Bold\" size=" + (int) TAMANHO + " bold=1 italic=0 charset=\"\" unicode=1"
                    + " stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1\n");
            w.write("common lineHeight=" + linha + " base=" + ascent + " scaleW=" + LARGURA + " scaleH=" + alturaPot
                    + " pages=1 packed=0\n");
            w.write("page id=0 file=\"texto.png\"\n");
            w.write("chars count=" + CHARS.length() + "\n");
            for (int i = 0; i < CHARS.length(); i++) {
                int[] p = pos[i];
                w.write("char id=" + (int) CHARS.charAt(i) + " x=" + p[0] + " y=" + p[1] + " width=" + med[i].cell
                        + " height=" + linha + " xoffset=" + (-med[i].k) + " yoffset=0 xadvance=" + med[i].adv + " page=0 chnl=15\n");
            }
        }
        System.out.println("gerado em " + saida.getAbsolutePath() + " (" + LARGURA + "x" + alturaPot + ", " + CHARS.length() + " caracteres)");
    }

    /** Avanço, tinta à esquerda da origem e largura de célula de cada caractere. */
    static Medida[] medir(Font f, FontMetrics fm, FontRenderContext frc, int linha) {
        Medida[] m = new Medida[CHARS.length()];
        for (int i = 0; i < CHARS.length(); i++) {
            String s = String.valueOf(CHARS.charAt(i));
            Rectangle2D b = f.createGlyphVector(frc, s).getVisualBounds();
            Medida x = new Medida();
            x.adv = fm.charWidth(CHARS.charAt(i));
            x.k = Math.max(2, (int) Math.ceil(-b.getMinX()) + 2);          // origem fica k px dentro da célula
            x.cell = Math.max(x.adv, (int) Math.ceil(b.getMaxX())) + x.k + 2;
            m[i] = x;
        }
        return m;
    }

    /** Posição (x, y) de cada caractere no atlas, com quebra de linha quando a largura acaba. */
    static int[][] posicoes(Medida[] med, int linha) {
        int[][] p = new int[CHARS.length()][2];
        int x = 0, y = 0;
        for (int i = 0; i < CHARS.length(); i++) {
            int w = med[i].cell;
            if (x + w > LARGURA) { x = 0; y += linha + 2; }
            p[i][0] = x;
            p[i][1] = y;
            x += w;
        }
        return p;
    }

    /** Desenha o atlas nas posições do .fnt. */
    static BufferedImage desenhar(Font f, int ascent, Medida[] med, int[][] pos, int altura) {
        BufferedImage img = new BufferedImage(LARGURA, altura, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = img.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.setColor(new java.awt.Color(255, 255, 255, 255));
        g.setFont(f);
        for (int i = 0; i < CHARS.length(); i++) {
            g.drawString(String.valueOf(CHARS.charAt(i)), pos[i][0] + med[i].k, pos[i][1] + ascent);
        }
        g.dispose();
        return img;
    }
}
