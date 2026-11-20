/** Articulações do boneco (índices da pose). Eixos: de frente para +X; ângulo de quadril/ombro positivo = perna/braço para frente; joelho positivo = dobra para trás. */
export const J = {
  rootY: 0, rootPitch: 1, rootRoll: 2, spinePitch: 3, spineTwist: 4, headPitch: 5, headYaw: 6,
  lShP: 7, lShA: 8, lElb: 9, rShP: 10, rShA: 11, rElb: 12,
  lHip: 13, lHipA: 14, lKnee: 15, lAnk: 16, rHip: 17, rHipA: 18, rKnee: 19, rAnk: 20,
} as const;
export const N_JOINTS = 21;
export type Pose = number[];
export type JointName = keyof typeof J;
export const newPose = (): Pose => new Array(N_JOINTS).fill(0);
