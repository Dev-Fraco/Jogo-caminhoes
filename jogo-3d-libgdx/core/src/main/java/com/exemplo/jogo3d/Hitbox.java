package com.exemplo.jogo3d;

import com.badlogic.gdx.graphics.g3d.ModelInstance;
import com.badlogic.gdx.graphics.g3d.model.Node;
import com.badlogic.gdx.math.Vector3;

/**
 * Hitboxes de um personagem, presas ao esqueleto: cada região é uma cápsula entre dois ossos
 * (ou da cabeça para cima), então acompanham qualquer animação: andar, correr, pular, agachar,
 * deitar e morrer. A cabeça é uma cápsula própria, pequena e precisa.
 *
 * Um raio devolve só a PRIMEIRA cápsula atingida (a mais próxima), então um tiro nunca conta
 * duas regiões ao mesmo tempo.
 */
final class Hitbox {
    static final int N = 13;
    // Ossos de cada cápsula (a = início, b = fim); "+HEAD" = topo da cabeça (calculado)
    private static final String[][] BONES = {
            {"Neck1", "+HEAD"},                       // 0 cabeça
            {"Hips", "Spine1"},                      // 1 quadril
            {"Spine1", "Neck"},                      // 2 peito
            {"Neck", "Neck1"},                       // 3 pescoço (conta como tronco)
            {"LeftArm", "LeftForeArm"}, {"LeftForeArm", "LeftHand"},
            {"RightUpperArm", "RightForeArm"}, {"RightForeArm", "RightHand"},
            {"LeftUpperLeg", "LeftLowerLeg"}, {"LeftLowerLeg", "LeftFoot"},
            {"RightUpperLeg", "RightLowerLeg"}, {"RightLowerLeg", "RightFoot"},
            {"Head", "+HEAD"},                       // 12 rosto/crânio (junto com a 0 cobre a cabeça)
    };
    private static final float[] RADIUS = {0.105f, 0.17f, 0.18f, 0.07f, 0.065f, 0.055f, 0.065f, 0.055f, 0.09f, 0.07f, 0.09f, 0.07f, 0.11f};
    private static final WeaponConfig.Region[] REGION = {
            WeaponConfig.Region.HEAD, WeaponConfig.Region.TORSO, WeaponConfig.Region.TORSO, WeaponConfig.Region.TORSO,
            WeaponConfig.Region.ARM, WeaponConfig.Region.ARM, WeaponConfig.Region.ARM, WeaponConfig.Region.ARM,
            WeaponConfig.Region.LEG, WeaponConfig.Region.LEG, WeaponConfig.Region.LEG, WeaponConfig.Region.LEG,
            WeaponConfig.Region.HEAD};
    private static final float HEAD_TOP = 0.20f;   // do osso Head até o topo do crânio (m)
    /** Engrossa as cápsulas (bots da sala são mais largos que o modelo base); 1 = modelo normal. */
    float raioMul = 1f;


    private final ModelInstance inst;
    private final Node[] na = new Node[N], nb = new Node[N];
    private final Node head, neck1;
    final Vector3[] a = new Vector3[N], b = new Vector3[N];
    final Vector3 center = new Vector3();   // centro aproximado (para teste rápido)
    float boundR = 1.3f;
    final Vector3 headCenter = new Vector3(), chest = new Vector3(), pelvis = new Vector3(), headTop = new Vector3();
    final Vector3 belly = new Vector3();   // barriga (região abdominal): ponto de atração do aim assist
    private final Vector3 tmp = new Vector3(), up = new Vector3();
    private long stamp = -1;

    Hitbox(ModelInstance inst) {
        this.inst = inst;
        head = inst.getNode("Head", true);
        neck1 = inst.getNode("Neck1", true);
        for (int i = 0; i < N; i++) {
            a[i] = new Vector3();
            b[i] = new Vector3();
            na[i] = inst.getNode(BONES[i][0], true);
            nb[i] = BONES[i][1].startsWith("+") ? null : inst.getNode(BONES[i][1], true);
        }
    }

    private void world(Node n, Vector3 out) {
        out.set(0f, 0f, 0f).mul(n.globalTransform).mul(inst.transform);
    }

    /** Recalcula as cápsulas a partir da pose atual (uma vez por quadro, só quando pedido). */
    void update(long frame) {
        if (frame == stamp) return;
        stamp = frame;
        if (head == null || neck1 == null) {
            // Sem esqueleto: volumes fixos pela posição do personagem
            inst.transform.getTranslation(tmp);
            for (int i = 0; i < N; i++) { a[i].set(tmp).add(0f, 0.9f, 0f); b[i].set(tmp).add(0f, 1.4f, 0f); }
            a[0].set(tmp).add(0f, 1.55f, 0f); b[0].set(tmp).add(0f, 1.75f, 0f);
        } else {
            Vector3 hp = headCenter;
            world(head, hp);
            world(neck1, tmp);
            up.set(hp).sub(tmp).nor();
            headTop.set(hp).mulAdd(up, HEAD_TOP);
            for (int i = 0; i < N; i++) {
                if (na[i] != null) world(na[i], a[i]);
                if (nb[i] != null) world(nb[i], b[i]);
                else b[i].set(headTop);
            }
            // cabeça: a cápsula 0 começa um pouco acima do Neck1 (não pega o pescoço)
            a[0].lerp(b[0], 0.35f);
            headCenter.set(a[12]).lerp(headTop, 0.5f);
        }
        chest.set(a[2]).lerp(b[2], 0.45f);
        pelvis.set(a[1]);
        belly.set(pelvis).lerp(chest, 0.5f);   // entre o quadril e o peito
        center.set(pelvis).lerp(headTop, 0.5f);
        float r = 0f;
        for (int i = 0; i < N; i++) r = Math.max(r, Math.max(center.dst(a[i]), center.dst(b[i])) + RADIUS[i] * raioMul);
        boundR = r;
    }

    /** Resultado de um teste de raio. */
    static final class Hit {
        float t = Float.MAX_VALUE;
        WeaponConfig.Region region;
        int bone;                    // índice da cápsula atingida (0..12): diz qual membro
        final Vector3 point = new Vector3();
    }

    /**
     * Raio (origem, direção normalizada) contra as cápsulas. Preenche hit se acertar antes de hit.t.
     * Devolve true se acertou.
     */
    boolean raycast(Vector3 o, Vector3 d, Hit hit) {
        // Teste rápido: esfera que envolve o corpo
        float ox = o.x - center.x, oy = o.y - center.y, oz = o.z - center.z;
        float bb = ox * d.x + oy * d.y + oz * d.z, cc = ox * ox + oy * oy + oz * oz - boundR * boundR;
        if (cc > 0f && bb > 0f) return false;
        if (bb * bb - cc < 0f) return false;
        boolean got = false;
        for (int i = 0; i < N; i++) {
            float t = capsule(o, d, a[i], b[i], RADIUS[i] * raioMul);
            if (t >= 0f && t < hit.t) {
                hit.t = t;
                hit.region = REGION[i];
                hit.bone = i;
                hit.point.set(o).mulAdd(d, t);
                got = true;
            }
        }
        return got;
    }

    /** Raio x cápsula (segmento pa-pb, raio r). Devolve t >= 0 ou -1. */
    static float capsule(Vector3 ro, Vector3 rd, Vector3 pa, Vector3 pb, float r) {
        float bax = pb.x - pa.x, bay = pb.y - pa.y, baz = pb.z - pa.z;
        float oax = ro.x - pa.x, oay = ro.y - pa.y, oaz = ro.z - pa.z;
        float baba = bax * bax + bay * bay + baz * baz;
        float bard = bax * rd.x + bay * rd.y + baz * rd.z;
        float baoa = bax * oax + bay * oay + baz * oaz;
        float rdoa = rd.x * oax + rd.y * oay + rd.z * oaz;
        float oaoa = oax * oax + oay * oay + oaz * oaz;
        float a = baba - bard * bard;
        float b = baba * rdoa - baoa * bard;
        float c = baba * oaoa - baoa * baoa - r * r * baba;
        float h = b * b - a * c;
        if (h >= 0f && a > 1e-8f) {
            float t = (-b - (float) Math.sqrt(h)) / a;
            float y = baoa + t * bard;
            if (y > 0f && y < baba && t >= 0f) return t;
            // pontas: esferas
            float ocx = y <= 0f ? oax : ro.x - pb.x, ocy = y <= 0f ? oay : ro.y - pb.y, ocz = y <= 0f ? oaz : ro.z - pb.z;
            b = rd.x * ocx + rd.y * ocy + rd.z * ocz;
            c = ocx * ocx + ocy * ocy + ocz * ocz - r * r;
            h = b * b - c;
            if (h > 0f) {
                t = -b - (float) Math.sqrt(h);
                if (t >= 0f) return t;
            }
            return -1f;
        }
        // raio paralelo ao eixo: testa as duas esferas
        float best = -1f;
        for (int k = 0; k < 2; k++) {
            float cx = ro.x - (k == 0 ? pa.x : pb.x), cy = ro.y - (k == 0 ? pa.y : pb.y), cz = ro.z - (k == 0 ? pa.z : pb.z);
            float bq = rd.x * cx + rd.y * cy + rd.z * cz, cq = cx * cx + cy * cy + cz * cz - r * r, hq = bq * bq - cq;
            if (hq > 0f) {
                float t = -bq - (float) Math.sqrt(hq);
                if (t >= 0f && (best < 0f || t < best)) best = t;
            }
        }
        return best;
    }
}
