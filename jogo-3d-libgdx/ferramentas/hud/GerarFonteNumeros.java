import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;

/**
 * Gera a fonte de números do HUD de armas (assets/hud2/numeros.fnt + numeros.png) a partir de uma TTF.
 * Renderiza em alta resolução: no jogo a fonte é reduzida, então o texto sai nítido em qualquer escala.
 *
 * Uso (na pasta ferramentas/hud):
 *   java GerarFonteNumeros.java <caminho-da-ttf> <pasta-de-saida>
 * Fonte usada: DejaVu Sans Condensed Bold (licença livre, ver assets/CREDITOS.md).
 */
public class GerarFonteNumeros {
    static final String CHARS = "0123456789/";
    static final float TAMANHO = 120f;     // pixels de altura de fonte na imagem (alta resolução)
    static final int ATLAS_W = 1024, ATLAS_H = 256;

    public static void main(String[] args) throws Exception {
        if (args.length < 2) {
            System.err.println("uso: GerarFonteNumeros <ttf> <saida>");
            System.exit(1);
        }
        Font base = Font.createFont(Font.TRUETYPE_FONT, new File(args[0])).deriveFont(TAMANHO);
        BufferedImage atlas = new BufferedImage(ATLAS_W, ATLAS_H, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = atlas.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_FRACTIONALMETRICS, RenderingHints.VALUE_FRACTIONALMETRICS_ON);
        g.setColor(new java.awt.Color(255, 255, 255, 255));
        g.setFont(base);
        FontMetrics fm = g.getFontMetrics();
        int linha = fm.getHeight(), ascent = fm.getAscent();

        int x = 0;
        int[][] celulas = new int[CHARS.length()][4];   // x, largura, altura, avanço
        for (int i = 0; i < CHARS.length(); i++) {
            char c = CHARS.charAt(i);
            int adv = fm.charWidth(c);
            int largura = adv + 2;                       // folga de 1 px de cada lado
            g.drawString(String.valueOf(c), x + 1, ascent);
            celulas[i] = new int[]{x, largura, linha, adv};
            x += largura;
        }
        g.dispose();
        if (x > ATLAS_W) throw new IllegalStateException("atlas pequeno demais: " + x);

        File saida = new File(args[1]);
        saida.mkdirs();
        javax.imageio.ImageIO.write(atlas, "png", new File(saida, "numeros.png"));

        try (Writer w = new OutputStreamWriter(new FileOutputStream(new File(saida, "numeros.fnt")), "UTF-8")) {
            w.write("info face=\"DejaVuSansCondensed-Bold\" size=" + (int) TAMANHO + " bold=1 italic=0 charset=\"\" unicode=1"
                    + " stretchH=100 smooth=1 aa=1 padding=0,0,0,0 spacing=1,1\n");
            w.write("common lineHeight=" + linha + " base=" + ascent + " scaleW=" + ATLAS_W + " scaleH=" + ATLAS_H
                    + " pages=1 packed=0\n");
            w.write("page id=0 file=\"numeros.png\"\n");
            w.write("chars count=" + CHARS.length() + "\n");
            for (int i = 0; i < CHARS.length(); i++) {
                int[] c = celulas[i];
                w.write("char id=" + (int) CHARS.charAt(i) + " x=" + c[0] + " y=0 width=" + c[1] + " height=" + c[2]
                        + " xoffset=0 yoffset=0 xadvance=" + c[3] + " page=0 chnl=15\n");
            }
        }
        System.out.println("gerado em " + saida.getAbsolutePath() + " (linha " + linha + ", " + CHARS.length() + " caracteres)");
    }
}
