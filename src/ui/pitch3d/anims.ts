import { J, N_JOINTS, newPose, type JointName, type Pose } from './joints';

/* =====================================================================
   Biblioteca de animações por quadros-chave (mais de 120 movimentos): cada animação é uma lista de poses-chave no tempo (0 a 1) que o
   desenhista interpola com suavidade. Poses são ângulos das articulações (joints.ts). O lado "direito" é o padrão; `dir` -1 espelha.
   Grupos: goleiro, chutes, passes, domínio, drible, defesa, cabeceio, comemoração, reações, lesão, bola parada, cerimônia, arbitragem.
   ===================================================================== */

type K = Partial<Record<JointName, number>>;
export interface AnimDef {
  /** duração (segundos de jogo) */ dur: number;
  /** instante do contato com a bola (0 a 1) */ strike: number;
  keys: [number, K][];
  /** grupo, para o catálogo e os testes */ group: string;
}
const defs: Record<string, AnimDef> = {};
/** Registra uma animação. */
const add = (group: string, name: string, dur: number, strike: number, keys: [number, K][]) => { defs[name] = { dur, strike, keys, group }; };

/* ---------------------------- goleiro (22) ---------------------------- */
const gk = (name: string, dur: number, strike: number, keys: [number, K][]) => add('goleiro', name, dur, strike, keys);
const GK_STANCE: K = { rootPitch: 0.22, rootY: -0.12, lKnee: 0.7, rKnee: 0.7, lHip: 0.35, rHip: 0.35, lShP: 0.7, rShP: 0.7, lShA: 0.6, rShA: 0.6, lElb: 0.8, rElb: 0.8 };
gk('gk_sidestep', 1.2, 0, [[0, GK_STANCE], [0.25, { ...GK_STANCE, rootRoll: 0.1, lHipA: 0.2, rHipA: -0.2 }], [0.5, GK_STANCE], [0.75, { ...GK_STANCE, rootRoll: -0.1, lHipA: -0.2, rHipA: 0.2 }], [1, GK_STANCE]]);
gk('gk_dive_low', 1.0, 0.4, [[0, GK_STANCE], [0.4, { rootRoll: 1.3, rootY: -0.1, rootPitch: 0.1, lShP: 1.8, rShP: 1.8, lShA: 0.2, rShA: 0.2, lKnee: 0.6, rKnee: 0.3 }], [1, { rootRoll: 1.5, rootY: -0.35, lShP: 1.9, rShP: 1.9, lShA: 0.15, rShA: 0.15, lKnee: 0.7, rKnee: 0.4 }]]);
gk('gk_dive_mid', 1.0, 0.4, [[0, GK_STANCE], [0.4, { rootRoll: 1.2, rootY: 0.3, lShP: 2.3, rShP: 2.3, lShA: 0.2, rShA: 0.2, lKnee: 0.5, rKnee: 0.25, lHip: 0.3 }], [1, { rootRoll: 1.5, rootY: -0.3, lShP: 2.4, rShP: 2.4, lKnee: 0.5, rKnee: 0.2 }]]);
gk('gk_dive_high', 1.1, 0.42, [[0, GK_STANCE], [0.45, { rootRoll: 0.8, rootY: 0.55, lShP: 2.9, rShP: 2.9, lShA: 0.15, rShA: 0.15, lKnee: 0.9, rKnee: 0.5, lHip: 0.5, spinePitch: -0.2 }], [1, { rootRoll: 1.5, rootY: -0.35, lShP: 2.7, rShP: 2.7, lKnee: 0.5, rKnee: 0.2 }]]);
gk('gk_dive_far', 1.2, 0.45, [[0, GK_STANCE], [0.5, { rootRoll: 1.1, rootY: 0.75, lShP: 3.0, rShP: 3.0, lShA: 0.1, rShA: 0.1, lKnee: 0.3, rKnee: 0.1, lHip: -0.1, spinePitch: -0.3, headPitch: -0.3 }], [1, { rootRoll: 1.55, rootY: -0.4, lShP: 2.8, rShP: 2.8, lKnee: 0.3, rKnee: 0.1 }]]);
gk('gk_catch_chest', 0.7, 0.3, [[0, GK_STANCE], [0.3, { lShP: 1.3, rShP: 1.3, lShA: 0.35, rShA: 0.35, lElb: 0.6, rElb: 0.6, rootPitch: 0.1, lKnee: 0.5, rKnee: 0.5 }], [0.55, { lShP: 0.9, rShP: 0.9, lShA: 0, rShA: 0, lElb: 2.1, rElb: 2.1, rootPitch: 0.3, spinePitch: 0.35, lKnee: 0.6, rKnee: 0.6 }], [1, { lShP: 0.9, rShP: 0.9, lElb: 2.1, rElb: 2.1, rootPitch: 0.25, spinePitch: 0.3 }]]);
gk('gk_catch_high', 0.9, 0.45, [[0, GK_STANCE], [0.25, { rootY: -0.2, lKnee: 1.0, rKnee: 1.0, lHip: 0.5, rHip: 0.5, lShP: 1.2, rShP: 1.2 }], [0.5, { rootY: 0.6, lKnee: 0.7, rKnee: 0.4, lHip: 0.3, rHip: -0.1, lShP: 3.0, rShP: 3.0, lShA: 0.15, rShA: 0.15, spinePitch: -0.2 }], [0.75, { rootY: 0.3, lShP: 2.0, rShP: 2.0, lElb: 1.6, rElb: 1.6, lKnee: 0.6, rKnee: 0.6 }], [1, { lShP: 1.0, rShP: 1.0, lElb: 2.0, rElb: 2.0, rootPitch: 0.15, lKnee: 0.3, rKnee: 0.3 }]]);
gk('gk_catch_low', 0.8, 0.35, [[0, GK_STANCE], [0.4, { rootPitch: 0.55, spinePitch: 0.2, lShP: 1.5, rShP: 1.5, lShA: 0.1, rShA: 0.1, lElb: 0.3, rElb: 0.3, lKnee: 0.9, rKnee: 0.9, lHip: 0.7, rHip: 0.7, rootY: -0.25 }], [1, { rootPitch: 0.45, spinePitch: 0.3, lShP: 1.1, rShP: 1.1, lElb: 1.8, rElb: 1.8, lKnee: 0.8, rKnee: 0.8, lHip: 0.6, rHip: 0.6, rootY: -0.2 }]]);
gk('gk_punch', 0.7, 0.4, [[0, GK_STANCE], [0.4, { rShP: 2.7, rElb: 1.6, lShP: 1.2, rootY: 0.3, lKnee: 0.5, rKnee: 0.3, spineTwist: -0.2 }], [0.55, { rShP: 2.9, rElb: 0.1, lShP: 0.8, rootY: 0.3, spineTwist: 0.2 }], [1, GK_STANCE]]);
gk('gk_punch2', 0.8, 0.45, [[0, GK_STANCE], [0.35, { lShP: 2.4, rShP: 2.4, lElb: 1.9, rElb: 1.9, rootY: 0.35, lKnee: 0.6, rKnee: 0.6 }], [0.55, { lShP: 2.9, rShP: 2.9, lElb: 0.1, rElb: 0.1, rootY: 0.4, spinePitch: -0.15 }], [1, GK_STANCE]]);
gk('gk_tip_over', 0.9, 0.45, [[0, GK_STANCE], [0.35, { rootRoll: 0.7, rootY: 0.4, lShP: 2.2, rShP: 3.0, lShA: 0.3, lKnee: 0.6, rKnee: 0.3, spinePitch: -0.2 }], [0.55, { rootRoll: 1.0, rootY: 0.45, rShP: 3.1, lShP: 2.0, rElb: -0.2 }], [1, { rootRoll: 1.5, rootY: -0.3, rShP: 2.8, lShP: 2.0 }]]);
gk('gk_foot_save', 0.7, 0.4, [[0, GK_STANCE], [0.35, { rootRoll: 0.3, rHip: 1.0, rKnee: 0.1, lKnee: 0.8, lHip: 0.3, lShA: 0.9, rShA: 0.9, rootPitch: -0.1, rootY: -0.1 }], [0.6, { rHip: 1.15, rKnee: 0.05, lShA: 0.8, rShA: 0.8 }], [1, GK_STANCE]]);
gk('gk_smother', 1.0, 0.4, [[0, GK_STANCE], [0.35, { rootPitch: 0.9, rootY: -0.4, lShP: 2.0, rShP: 2.0, lKnee: 0.8, rKnee: 0.4, spinePitch: 0.3 }], [0.7, { rootPitch: 1.3, rootY: -0.8, lShP: 1.9, rShP: 1.9, lElb: 1.2, rElb: 1.2, lKnee: 0.3, rKnee: 0.2 }], [1, { rootPitch: 1.35, rootY: -0.85, lShP: 1.8, rShP: 1.8, lElb: 1.5, rElb: 1.5 }]]);
gk('gk_goal_kick', 0.9, 0.5, [[0, GK_STANCE], [0.3, { rHip: -0.9, rKnee: 1.2, lKnee: 0.4, spineTwist: 0.2, lShP: 0.5, rShP: -0.4, lShA: 0.7, rShA: 0.7 }], [0.5, { rHip: 1.3, rKnee: 0.1, rootPitch: -0.15, spineTwist: -0.3, lShP: -0.4, rShP: 0.6, lShA: 0.8, rShA: 0.5 }], [1, { rHip: 0.3, rKnee: 0.3 }]]);
gk('gk_throw_over', 0.9, 0.5, [[0, GK_STANCE], [0.35, { rShP: 3.0, rElb: 1.9, lShP: 1.3, lShA: 0.5, spineTwist: -0.4, rootPitch: -0.1, lKnee: 0.4, rKnee: 0.4 }], [0.55, { rShP: 1.6, rElb: 0.1, lShP: 0.5, spineTwist: 0.3, rootPitch: 0.2 }], [1, { rShP: 0.4, rElb: 0.3 }]]);
gk('gk_throw_roll', 0.9, 0.5, [[0, GK_STANCE], [0.35, { rShP: -0.6, rElb: 0.2, rootPitch: 0.35, lKnee: 0.8, rKnee: 0.6, lShP: 0.9, spineTwist: 0.15, rootY: -0.2 }], [0.55, { rShP: 1.0, rElb: 0.1, rootPitch: 0.5, spineTwist: -0.15, lKnee: 0.8, rKnee: 0.7, rootY: -0.25 }], [1, { rShP: 0.5, rootPitch: 0.2 }]]);
gk('gk_clear_volley', 0.8, 0.45, [[0, GK_STANCE], [0.35, { rHip: -0.6, rKnee: 1.3, lKnee: 0.4, lShA: 0.8, rShA: 0.8 }], [0.55, { rHip: 1.5, rKnee: 0.15, rootPitch: -0.2, lShA: 0.9, rShA: 0.9, rootY: 0.1 }], [1, GK_STANCE]]);
gk('gk_claim_cross', 1.0, 0.5, [[0, GK_STANCE], [0.3, { rootY: -0.2, lKnee: 0.9, rKnee: 0.9, lShP: 1.2, rShP: 1.2 }], [0.55, { rootY: 0.65, lKnee: 0.9, rKnee: 0.3, lHip: 0.5, rHip: -0.2, lShP: 2.9, rShP: 2.9, spinePitch: -0.25 }], [0.8, { rootY: 0.3, lShP: 2.0, rShP: 2.0, lElb: 1.7, rElb: 1.7 }], [1, { lShP: 1.0, rShP: 1.0, lElb: 2.0, rElb: 2.0, rootPitch: 0.15 }]]);
gk('gk_shout', 1.6, 0, [[0, GK_STANCE], [0.25, { rShP: 1.5, rElb: 0.1, lShP: 0.5, lShA: 0.3, headPitch: -0.1, spinePitch: -0.1, headYaw: -0.3 }], [0.6, { rShP: 1.4, rElb: 0.2, lShA: 0.5, headYaw: 0.2 }], [1, { rShP: 0.3 }]]);
gk('gk_cheer', 1.4, 0, [[0, {}], [0.3, { rShP: 2.7, rElb: 1.8, lShP: 0.4, rootY: 0.15, headPitch: -0.2 }], [0.5, { rShP: 2.9, rElb: 1.4, rootY: 0.05 }], [0.7, { rShP: 2.7, rElb: 1.8, rootY: 0.15 }], [1, {}]]);
gk('gk_cover_post', 0.9, 0, [[0, GK_STANCE], [0.4, { ...GK_STANCE, rootRoll: 0.18, lHipA: 0.35, rHipA: -0.35, lShA: 0.9, rShA: 0.9 }], [1, { ...GK_STANCE, rootRoll: 0.18, lHipA: 0.35, rHipA: -0.35, lShA: 0.9, rShA: 0.9 }]]);
gk('gk_pat_ground', 1.5, 0, [[0, {}], [0.3, { rootPitch: 0.6, rootY: -0.3, lKnee: 1.0, rKnee: 0.8, lHip: 0.9, rHip: 0.8, lShP: 1.4, rShP: 1.4, lElb: 0.2, rElb: 0.2 }], [0.6, { rootPitch: 0.6, rootY: -0.3, lKnee: 1.0, rKnee: 0.8, lHip: 0.9, rHip: 0.8, lShP: 1.7, rShP: 1.7 }], [1, {}]]);

/* ---------------------------- chutes (10) ---------------------------- */
/** Chute: perna vai atrás, estala à frente e termina alta; parâmetros mudam a amplitude e a inclinação do corpo. */
const kickKeys = (back: number, bend: number, fwd: number, lean: number, extra: K = {}): [number, K][] => [
  [0, {}],
  [0.42, { rHip: -back, rKnee: bend, lHip: -0.12, lKnee: 0.35, rootPitch: lean, spineTwist: 0.3, lShP: 0.4, rShP: -0.4, lShA: 0.9, rShA: 0.9, headPitch: 0.25, ...extra }],
  [0.58, { rHip: fwd, rKnee: 0.15, rAnk: 0.4, rootPitch: lean, spineTwist: -0.3, lShP: -0.2, rShP: 0.2, lShA: 0.9, rShA: 0.9, headPitch: 0.25, ...extra }],
  [1, { rHip: fwd * 0.4, rKnee: bend * 0.3, rootPitch: lean * 0.3, lShA: 0.5, rShA: 0.5 }],
];
const shot = (name: string, dur: number, back: number, bend: number, fwd: number, lean: number, extra: K = {}) => add('chute', name, dur, 0.45, kickKeys(back, bend, fwd, lean, extra));
shot('shot_curl', 0.8, 0.6, 1.0, 1.0, 0.05, { rHipA: -0.5 });
shot('shot_toe', 0.55, 0.5, 0.8, 1.2, 0.2);
shot('shot_chip', 0.7, 0.7, 1.4, 0.9, 0.12, { rAnk: 0.8 });
shot('shot_volley', 0.8, 0.9, 1.4, 1.3, -0.1, { rootY: 0.18 });
shot('shot_half_volley', 0.7, 0.9, 1.5, 1.2, 0.1);
add('chute', 'shot_scissor', 1.0, 0.5, [[0, {}], [0.4, { rootY: 0.55, rootRoll: 0.9, lHip: 1.1, lKnee: 0.5, rHip: -0.4, rKnee: 0.8, lShA: 1.1, rShA: 1.1 }], [0.6, { rootY: 0.6, rootRoll: 1.1, rHip: 1.4, rKnee: 0.2, lHip: -0.3, lKnee: 0.9, lShA: 1.2, rShA: 1.2 }], [1, { rootY: -0.1, rootRoll: 0.4 }]]);
add('chute', 'shot_bicycle', 1.2, 0.5, [[0, {}], [0.3, { rootY: 0.2, lKnee: 0.8, rKnee: 0.8, lHip: 0.6, rHip: 0.6, rootPitch: -0.5 }], [0.5, { rootY: 0.8, rootPitch: -1.5, lHip: 0.5, lKnee: 0.8, rHip: 1.8, rKnee: 0.1, lShP: 1.2, rShP: 1.2, lShA: 1.0, rShA: 1.0, spinePitch: -0.4 }], [0.75, { rootY: 0.5, rootPitch: -1.7, rHip: 1.4, rKnee: 0.3, lShP: 0.8, rShP: 0.8, lShA: 1.2, rShA: 1.2 }], [1, { rootY: -0.3, rootPitch: -1.0, lShA: 1.0, rShA: 1.0 }]]);
shot('shot_power', 0.8, 1.3, 1.9, 1.4, 0.22, { rootY: 0.05 });
shot('shot_placed', 0.7, 0.8, 1.2, 1.0, 0.1, { rHipA: 0.35 });

/* ---------------------------- passes e cruzamentos (10) ---------------------------- */
const pass = (name: string, dur: number, back: number, bend: number, fwd: number, lean: number, extra: K = {}) => add('passe', name, dur, 0.42, kickKeys(back, bend, fwd, lean, extra));
pass('pass_through', 0.6, 0.6, 0.9, 0.85, 0.1, { rHipA: 0.2 });
pass('pass_lob', 0.7, 0.8, 1.3, 0.9, -0.12, { rAnk: 0.7 });
pass('pass_outside', 0.55, 0.5, 0.7, 0.7, 0.05, { rHipA: -0.45 });
pass('cross_low', 0.65, 0.8, 1.1, 1.0, 0.08, { spineTwist: 0.3 });
pass('cross_cutback', 0.6, 0.55, 0.8, 0.9, 0.12, { rHipA: 0.3 });
add('passe', 'pass_backheel', 0.7, 0.5, [[0, {}], [0.4, { rHip: 0.4, rKnee: 0.4, lKnee: 0.4, spineTwist: 0.2 }], [0.55, { rHip: -0.9, rKnee: 0.5, rootPitch: 0.1, lKnee: 0.5 }], [1, {}]]);

/* ---------------------------- domínio de bola (8) ---------------------------- */
const ctl = (name: string, dur: number, strike: number, keys: [number, K][]) => add('dominio', name, dur, strike, keys);
ctl('control_chest', 0.7, 0.35, [[0, {}], [0.4, { spinePitch: -0.45, rootPitch: -0.1, lShA: 1.2, rShA: 1.2, lShP: 0.6, rShP: 0.6, lKnee: 0.3, rKnee: 0.3, headPitch: -0.1 }], [0.7, { spinePitch: 0.2, lShA: 0.8, rShA: 0.8, lKnee: 0.35, rKnee: 0.35, headPitch: 0.3 }], [1, {}]]);
ctl('control_thigh', 0.65, 0.4, [[0, {}], [0.4, { rHip: 1.1, rKnee: 0.9, lKnee: 0.25, rootPitch: -0.05, lShA: 0.8, rShA: 0.8, headPitch: 0.3 }], [0.7, { rHip: 0.7, rKnee: 0.8, lShA: 0.6, rShA: 0.6, headPitch: 0.35 }], [1, {}]]);
ctl('control_head', 0.8, 0.45, [[0, {}], [0.3, { rootY: 0.2, lKnee: 0.5, rKnee: 0.5, spinePitch: -0.3, headPitch: -0.3, lShA: 0.9, rShA: 0.9 }], [0.55, { rootY: 0.2, spinePitch: 0.1, headPitch: 0.3, lShA: 0.9, rShA: 0.9 }], [1, {}]]);
ctl('control_sole', 0.6, 0.4, [[0, {}], [0.4, { rHip: 0.5, rKnee: 0.1, rAnk: -0.5, lKnee: 0.45, rootPitch: 0.05, headPitch: 0.45, lShA: 0.7, rShA: 0.7 }], [1, {}]]);
ctl('control_trap_run', 0.6, 0.35, [[0, {}], [0.35, { rHip: 0.6, rKnee: 0.7, rootPitch: 0.25, lKnee: 0.5, lShP: 0.5, rShP: -0.5, lShA: 0.5, rShA: 0.5 }], [1, { rootPitch: 0.1 }]]);
ctl('control_turn', 0.8, 0.35, [[0, {}], [0.35, { rHip: 0.7, rKnee: 0.6, spineTwist: -0.5, lKnee: 0.4, lShA: 0.8, rShA: 0.8, rootPitch: 0.15 }], [0.7, { spineTwist: 0.6, rootPitch: 0.2, lKnee: 0.5, lShA: 0.7, rShA: 0.7 }], [1, {}]]);
ctl('control_cushion', 0.6, 0.35, [[0, {}], [0.35, { rootY: -0.1, lKnee: 0.5, rKnee: 0.5, spinePitch: 0.2, rShA: 0.9, lShA: 0.9, headPitch: 0.4, rHip: 0.4 }], [1, {}]]);

/* ---------------------------- drible (10) ---------------------------- */
const drb = (name: string, dur: number, keys: [number, K][]) => add('drible', name, dur, 0.5, keys);
drb('dribble_stepover', 0.7, [[0, {}], [0.25, { rHip: 0.9, rKnee: 0.5, rootPitch: 0.22, lKnee: 0.4, lShA: 0.7, rShA: 0.7 }], [0.5, { rHip: 0.3, rHipA: -0.6, rKnee: 0.8, rootPitch: 0.25, rootRoll: -0.15 }], [0.75, { lHip: 0.9, lKnee: 0.5, rootPitch: 0.22, lShA: 0.7, rShA: 0.7 }], [1, { rootPitch: 0.1 }]]);
drb('dribble_feint_l', 0.6, [[0, {}], [0.3, { rootRoll: -0.25, rootPitch: 0.2, lHipA: 0.35, spineTwist: 0.3, lKnee: 0.5, rKnee: 0.4, lShA: 0.8, rShA: 0.8 }], [0.65, { rootRoll: 0.25, rootPitch: 0.25, spineTwist: -0.3, lShA: 0.8, rShA: 0.8 }], [1, { rootPitch: 0.1 }]]);
drb('dribble_feint_r', 0.6, [[0, {}], [0.3, { rootRoll: 0.25, rootPitch: 0.2, rHipA: 0.35, spineTwist: -0.3, lKnee: 0.4, rKnee: 0.5, lShA: 0.8, rShA: 0.8 }], [0.65, { rootRoll: -0.25, rootPitch: 0.25, spineTwist: 0.3, lShA: 0.8, rShA: 0.8 }], [1, { rootPitch: 0.1 }]]);
drb('dribble_dragback', 0.7, [[0, {}], [0.3, { rHip: 0.8, rKnee: 0.2, rootPitch: -0.05, lKnee: 0.5, lShA: 0.6, rShA: 0.6 }], [0.55, { rHip: 0.2, rKnee: 0.9, rootPitch: 0.2, spineTwist: 0.4 }], [1, { rootPitch: 0.15 }]]);
drb('dribble_cruyff', 0.8, [[0, {}], [0.3, { rHip: 0.5, rKnee: 0.4, rootPitch: 0.1, spineTwist: -0.4, lKnee: 0.5, lShA: 0.7, rShA: 0.7 }], [0.55, { rHip: -0.3, rKnee: 0.9, spineTwist: 0.8, rootPitch: 0.2 }], [1, { rootPitch: 0.2, spineTwist: 0.2 }]]);
drb('dribble_roulette', 0.9, [[0, {}], [0.25, { rHip: 0.3, rKnee: 0.5, lKnee: 0.5, rootPitch: 0.2, spineTwist: -0.6, lShA: 0.8, rShA: 0.8 }], [0.6, { spineTwist: 0.9, lHip: 0.3, lKnee: 0.5, rootPitch: 0.25, rootRoll: 0.2 }], [1, { rootPitch: 0.15 }]]);
drb('dribble_nutmeg', 0.6, [[0, {}], [0.3, { rHip: 0.9, rKnee: 0.6, rHipA: 0.3, rootPitch: 0.2, lKnee: 0.4, lShA: 0.7, rShA: 0.7 }], [0.55, { rHip: 0.5, rHipA: 0.5, rKnee: 0.3, rootPitch: 0.3, headPitch: 0.4 }], [1, { rootPitch: 0.15 }]]);
drb('dribble_sprint_push', 0.6, [[0, {}], [0.3, { rHip: 0.8, rKnee: 0.5, rootPitch: 0.4, lShP: -0.8, rShP: 0.9, lElb: 1.3, rElb: 1.3, lKnee: 0.8, lHip: -0.4 }], [1, { rootPitch: 0.3 }]]);
drb('dribble_shield', 0.9, [[0, {}], [0.3, { rootPitch: 0.3, spineTwist: 0.6, lShA: 1.0, rShA: 0.5, lElb: 0.9, lKnee: 0.7, rKnee: 0.6, lHip: 0.4, rHip: -0.2 }], [0.7, { rootPitch: 0.32, spineTwist: 0.65, lShA: 1.1, lElb: 0.9, lKnee: 0.75, rKnee: 0.6 }], [1, { rootPitch: 0.15 }]]);
drb('dribble_elastico', 0.8, [[0, {}], [0.25, { rHip: 0.7, rHipA: -0.4, rKnee: 0.5, rootPitch: 0.2, lShA: 0.7, rShA: 0.7 }], [0.5, { rHip: 0.8, rHipA: 0.45, rKnee: 0.5, rootPitch: 0.25, rootRoll: 0.2 }], [1, { rootPitch: 0.12 }]]);

/* ---------------------------- defesa (16) ---------------------------- */
const def = (name: string, dur: number, strike: number, keys: [number, K][]) => add('defesa', name, dur, strike, keys);
def('tackle_stand', 0.7, 0.45, [[0, {}], [0.4, { rHip: 1.0, rKnee: 0.15, lKnee: 0.7, rootPitch: 0.25, lShA: 0.9, rShA: 0.9, rootY: -0.1 }], [0.6, { rHip: 1.1, rKnee: 0.05, lKnee: 0.8, rootPitch: 0.3, lShA: 0.9, rShA: 0.9 }], [1, {}]]);
def('tackle_block', 0.7, 0.45, [[0, {}], [0.4, { rHip: 0.7, rKnee: 0.5, rAnk: -0.4, lKnee: 0.8, rootPitch: 0.3, rootY: -0.15, lShA: 1.0, rShA: 1.0 }], [1, {}]]);
def('tackle_shoulder', 0.8, 0.5, [[0, {}], [0.4, { rootPitch: 0.4, rootRoll: -0.15, spineTwist: 0.45, rShA: 0.4, lShA: 1.1, lElb: 1.1, lKnee: 0.7, rKnee: 0.6, lHip: 0.4 }], [0.6, { rootPitch: 0.42, rootRoll: -0.2, spineTwist: 0.5, lKnee: 0.8 }], [1, {}]]);
def('tackle_poke', 0.6, 0.5, [[0, {}], [0.4, { rootPitch: 0.45, rHip: 1.2, rKnee: 0.05, lKnee: 0.9, rootY: -0.2, lShA: 1.1, rShA: 0.4, lShP: 0.5 }], [1, {}]]);
def('intercept_stretch', 0.7, 0.5, [[0, {}], [0.4, { rootPitch: 0.5, rootRoll: 0.2, rHip: 1.2, rKnee: 0.05, lKnee: 0.9, rootY: -0.2, lShA: 1.2, rShA: 0.8 }], [1, {}]]);
def('intercept_jump', 0.9, 0.5, [[0, {}], [0.35, { rootY: 0.55, lKnee: 0.9, rKnee: 0.4, lHip: 0.5, rHip: -0.2, lShA: 1.1, rShA: 1.1, rShP: 0.8 }], [0.75, { rootY: 0.1, lShA: 0.8, rShA: 0.8 }], [1, {}]]);
def('clear_kick', 0.7, 0.45, kickKeys(1.1, 1.6, 1.3, 0.1, { rootY: 0.05 }));
def('clear_head', 0.9, 0.5, [[0, {}], [0.3, { rootY: 0.5, lKnee: 0.9, rKnee: 0.9, lHip: 0.5, rHip: -0.2, spinePitch: -0.5, lShA: 1.1, rShA: 1.1 }], [0.55, { rootY: 0.55, spinePitch: 0.5, headPitch: 0.5, lShA: 1.1, rShA: 1.1 }], [1, {}]]);
def('mark_jockey', 1.2, 0, [[0, {}], [0.3, { rootPitch: 0.22, rootY: -0.1, lKnee: 0.6, rKnee: 0.6, lHip: 0.35, rHip: 0.35, lShA: 0.9, rShA: 0.9, lElb: 0.5, rElb: 0.5 }], [1, { rootPitch: 0.22, rootY: -0.1, lKnee: 0.6, rKnee: 0.6, lHip: 0.35, rHip: 0.35, lShA: 0.9, rShA: 0.9, lElb: 0.5, rElb: 0.5 }]]);
def('press_lunge', 0.7, 0.5, [[0, {}], [0.35, { rootPitch: 0.5, lShP: 1.0, rShP: -0.4, lElb: 0.9, rElb: 1.1, lHip: 0.9, lKnee: 0.5, rHip: -0.5, rKnee: 0.9, rootY: -0.1 }], [1, { rootPitch: 0.25 }]]);
def('block_shot', 0.8, 0.5, [[0, {}], [0.35, { rootPitch: 0.3, rootY: -0.3, lKnee: 1.0, rKnee: 1.0, lHip: 0.7, rHip: 0.7, lShP: 0.6, rShP: 0.6, lElb: 1.5, rElb: 1.5, headYaw: 0.3 }], [1, {}]]);
def('foul_push', 0.6, 0.5, [[0, {}], [0.35, { rootPitch: 0.3, lShP: 1.5, rShP: 1.5, lElb: 0.4, rElb: 0.4, lKnee: 0.5, rKnee: 0.5 }], [1, {}]]);
def('foul_trip', 0.7, 0.5, [[0, {}], [0.4, { rootPitch: 0.3, rHip: 1.0, rHipA: 0.3, rKnee: 0.1, lKnee: 0.8, lShA: 1.0, rShA: 1.0, rootY: -0.1 }], [1, {}]]);

/* ---------------------------- cabeceio e saltos (7) ---------------------------- */
const hd = (name: string, dur: number, keys: [number, K][]) => add('cabeceio', name, dur, 0.5, keys);
hd('header_dive', 1.2, [[0, {}], [0.4, { rootPitch: 1.1, rootY: 0.1, spinePitch: -0.3, lShP: 1.8, rShP: 1.8, lKnee: 0.6, rKnee: 0.6 }], [0.55, { rootPitch: 1.35, rootY: -0.3, headPitch: 0.4, lShP: 1.8, rShP: 1.8, lKnee: 0.7, rKnee: 0.5 }], [1, { rootPitch: 1.45, rootY: -0.9, lShP: 1.6, rShP: 1.6, lElb: 0.3, rElb: 0.3 }]]);
hd('header_flick', 0.8, [[0, {}], [0.4, { rootY: 0.35, spinePitch: -0.2, headYaw: 0.5, headPitch: 0.15, lKnee: 0.7, rKnee: 0.5, lShA: 0.9, rShA: 0.9 }], [1, {}]]);
hd('header_defend', 0.9, [[0, {}], [0.4, { rootY: 0.5, lKnee: 0.9, rKnee: 0.9, spinePitch: -0.35, headPitch: -0.1, lShA: 1.0, rShA: 1.0, rElb: 0.8, lElb: 0.8 }], [0.6, { rootY: 0.52, spinePitch: 0.4, headPitch: 0.45, lShA: 1.0, rShA: 1.0 }], [1, {}]]);
hd('header_back', 0.9, [[0, {}], [0.45, { rootY: 0.45, lKnee: 0.9, rKnee: 0.9, spinePitch: -0.6, headPitch: -0.5, lShA: 1.1, rShA: 1.1, lShP: 0.5, rShP: 0.5 }], [1, {}]]);

/* ---------------------------- comemoração (18) ---------------------------- */
const cel = (name: string, dur: number, keys: [number, K][]) => add('comemoracao', name, dur, 0, keys);
cel('cele_run_arms', 2.0, [[0, {}], [0.15, { lShA: 1.5, rShA: 1.5, lShP: 0.2, rShP: 0.2, spinePitch: -0.15, headPitch: -0.2 }], [0.85, { lShA: 1.5, rShA: 1.5, lShP: 0.2, rShP: 0.2, spinePitch: -0.15, headPitch: -0.2 }], [1, {}]]);
cel('cele_knee_slide', 1.8, [[0, {}], [0.3, { rootY: -0.55, rootPitch: -0.5, lKnee: 1.6, rKnee: 0.4, lHip: 0.3, rHip: 0.9, lShP: 2.6, rShP: 2.6, lShA: 0.7, rShA: 0.7, headPitch: -0.3, spinePitch: -0.3 }], [0.75, { rootY: -0.62, rootPitch: -0.55, lKnee: 1.6, rKnee: 0.4, lHip: 0.3, rHip: 0.9, lShP: 2.2, rShP: 2.2, lShA: 0.9, rShA: 0.9, headPitch: -0.3, spinePitch: -0.35 }], [1, { rootY: -0.1, lKnee: 0.5 }]]);
cel('cele_fist', 1.4, [[0, {}], [0.25, { rShP: 1.1, rElb: 1.9, rShA: 0.2, spinePitch: 0.2, headPitch: 0.1, lKnee: 0.4, rKnee: 0.4, rootY: -0.08, lShP: 0.6, lElb: 1.2 }], [0.5, { rShP: 1.4, rElb: 1.7, spinePitch: 0.25, rootY: -0.1, lKnee: 0.45, rKnee: 0.45 }], [0.75, { rShP: 1.1, rElb: 1.9, spinePitch: 0.2 }], [1, {}]]);
cel('cele_crown', 1.8, [[0, {}], [0.3, { lShP: 2.9, rShP: 2.9, lElb: 1.9, rElb: 1.9, lShA: 0.5, rShA: 0.5, headPitch: -0.1 }], [0.8, { lShP: 2.9, rShP: 2.9, lElb: 1.9, rElb: 1.9, lShA: 0.5, rShA: 0.5, rootY: 0.1 }], [1, {}]]);
cel('cele_kiss_badge', 1.8, [[0, {}], [0.3, { rShP: 1.0, rElb: 2.3, rShA: -0.2, headPitch: 0.4, spinePitch: 0.15 }], [0.5, { rShP: 1.0, rElb: 2.3, rShA: -0.2, headPitch: 0.55, spinePitch: 0.22 }], [0.8, { rShP: 1.0, rElb: 2.3, rShA: -0.2, headPitch: 0.4 }], [1, {}]]);
cel('cele_point_sky', 1.8, [[0, {}], [0.3, { rShP: 2.9, rElb: 0.05, rShA: 0.05, headPitch: -0.5, spinePitch: -0.15, lShP: 0.3, lElb: 0.4 }], [0.8, { rShP: 2.9, rElb: 0.05, headPitch: -0.55, spinePitch: -0.15 }], [1, {}]]);
cel('cele_dance', 2.4, [[0, {}], [0.15, { lShP: 1.2, rShP: -0.3, lElb: 1.5, rElb: 0.6, rootY: 0.1, spineTwist: 0.35, lKnee: 0.5, rKnee: 0.3, rootRoll: 0.12 }], [0.3, { lShP: -0.3, rShP: 1.2, lElb: 0.6, rElb: 1.5, rootY: 0.05, spineTwist: -0.35, lKnee: 0.3, rKnee: 0.5, rootRoll: -0.12 }], [0.45, { lShP: 1.2, rShP: -0.3, lElb: 1.5, rElb: 0.6, rootY: 0.1, spineTwist: 0.35, lKnee: 0.5, rKnee: 0.3, rootRoll: 0.12 }], [0.6, { lShP: -0.3, rShP: 1.2, lElb: 0.6, rElb: 1.5, rootY: 0.05, spineTwist: -0.35, lKnee: 0.3, rKnee: 0.5, rootRoll: -0.12 }], [0.8, { lShP: 1.2, rShP: -0.3, lElb: 1.5, rElb: 0.6, rootY: 0.1, spineTwist: 0.35 }], [1, {}]]);
cel('cele_shush', 1.6, [[0, {}], [0.3, { rShP: 1.2, rElb: 2.4, rShA: -0.1, headPitch: 0.1, spinePitch: 0.1 }], [0.85, { rShP: 1.2, rElb: 2.4, rShA: -0.1, headPitch: 0.1 }], [1, {}]]);
cel('cele_airplane', 2.2, [[0, {}], [0.15, { lShA: 1.55, rShA: 1.55, rootRoll: 0.25, spinePitch: 0.1, lShP: 0.1, rShP: 0.1 }], [0.5, { lShA: 1.55, rShA: 1.55, rootRoll: -0.25, spinePitch: 0.1 }], [0.85, { lShA: 1.55, rShA: 1.55, rootRoll: 0.25, spinePitch: 0.1 }], [1, {}]]);
cel('cele_hug', 1.8, [[0, {}], [0.3, { lShP: 1.2, rShP: 1.2, lShA: 0.9, rShA: 0.9, lElb: 0.9, rElb: 0.9, spinePitch: 0.15 }], [0.8, { lShP: 1.4, rShP: 1.4, lShA: 0.3, rShA: 0.3, lElb: 1.5, rElb: 1.5, spinePitch: 0.2, rootY: -0.03 }], [1, {}]]);
cel('cele_salute', 1.6, [[0, {}], [0.25, { rShP: 1.6, rElb: 2.6, rShA: 0.5, headPitch: -0.1 }], [0.8, { rShP: 1.6, rElb: 2.6, rShA: 0.5, headPitch: -0.1 }], [1, {}]]);
cel('cele_heart', 1.8, [[0, {}], [0.3, { lShP: 1.1, rShP: 1.1, lElb: 2.0, rElb: 2.0, lShA: -0.1, rShA: -0.1, headPitch: 0.15 }], [0.8, { lShP: 1.1, rShP: 1.1, lElb: 2.0, rElb: 2.0, headPitch: 0.2, rootY: -0.02 }], [1, {}]]);
cel('cele_bow', 1.8, [[0, {}], [0.35, { spinePitch: 0.9, rootPitch: 0.25, lShP: -0.2, rShP: 0.3, lElb: 0.3, rElb: 0.5, headPitch: 0.3 }], [0.65, { spinePitch: 0.9, rootPitch: 0.25, rShP: 0.3, headPitch: 0.3 }], [1, {}]]);
cel('cele_prayer', 2.2, [[0, {}], [0.3, { rootY: -0.5, lKnee: 1.7, rKnee: 1.7, lHip: 0.9, rHip: 0.9, rootPitch: 0.1, lShP: 1.1, rShP: 1.1, lElb: 2.2, rElb: 2.2, headPitch: 0.4, spinePitch: 0.1 }], [0.85, { rootY: -0.5, lKnee: 1.7, rKnee: 1.7, lHip: 0.9, rHip: 0.9, lShP: 1.1, rShP: 1.1, lElb: 2.2, rElb: 2.2, headPitch: 0.5 }], [1, {}]]);
cel('cele_clap', 1.8, [[0, {}], [0.2, { lShP: 1.3, rShP: 1.3, lElb: 1.2, rElb: 1.2, lShA: 0.35, rShA: 0.35 }], [0.35, { lShP: 1.3, rShP: 1.3, lElb: 1.5, rElb: 1.5, lShA: 0, rShA: 0 }], [0.5, { lShP: 1.3, rShP: 1.3, lElb: 1.2, rElb: 1.2, lShA: 0.35, rShA: 0.35 }], [0.65, { lShP: 1.3, rShP: 1.3, lElb: 1.5, rElb: 1.5, lShA: 0, rShA: 0 }], [1, {}]]);
cel('cele_chest_bump', 1.0, [[0, {}], [0.3, { rootY: 0.45, lKnee: 0.6, rKnee: 0.6, spinePitch: -0.2, lShA: 0.8, rShA: 0.8, lElb: 0.8, rElb: 0.8 }], [0.5, { rootY: 0.5, spinePitch: 0.25, lShA: 0.5, rShA: 0.5, lElb: 1.3, rElb: 1.3, lShP: 0.4, rShP: 0.4 }], [1, {}]]);

/* ---------------------------- reações e gestos (16) ---------------------------- */
const rea = (name: string, dur: number, keys: [number, K][]) => add('reacao', name, dur, 0, keys);
rea('react_head_hands', 1.8, [[0, {}], [0.3, { lShP: 2.7, rShP: 2.7, lElb: 2.2, rElb: 2.2, lShA: 0.3, rShA: 0.3, headPitch: 0.1, spinePitch: 0.1 }], [0.85, { lShP: 2.7, rShP: 2.7, lElb: 2.2, rElb: 2.2, headPitch: 0.2, spinePitch: 0.15 }], [1, {}]]);
rea('react_kneel', 2.0, [[0, {}], [0.35, { rootY: -0.55, lKnee: 1.7, rKnee: 1.7, lHip: 0.9, rHip: 0.9, rootPitch: 0.3, spinePitch: 0.3, headPitch: 0.5, lShP: 0.5, rShP: 0.5 }], [0.9, { rootY: -0.55, lKnee: 1.7, rKnee: 1.7, lHip: 0.9, rHip: 0.9, rootPitch: 0.35, spinePitch: 0.35, headPitch: 0.6 }], [1, {}]]);
rea('react_lie', 2.0, [[0, {}], [0.5, { rootPitch: -1.5, rootY: -1.0, lShP: -0.6, rShP: -0.6, lShA: 0.5, rShA: 0.5, lKnee: 0.2, rKnee: 0.2, headPitch: -0.3 }], [1, { rootPitch: -1.5, rootY: -1.0, lShP: -0.6, rShP: -0.6, lShA: 0.5, rShA: 0.5 }]]);
rea('react_thumbs', 1.4, [[0, {}], [0.3, { rShP: 1.2, rElb: 1.6, rShA: 0.3 }], [0.8, { rShP: 1.3, rElb: 1.6, rShA: 0.3 }], [1, {}]]);
rea('react_sorry', 1.4, [[0, {}], [0.3, { rShP: 1.5, rElb: 0.9, rShA: 0.4, headPitch: 0.3, spinePitch: 0.1 }], [0.8, { rShP: 1.5, rElb: 0.9, headPitch: 0.35 }], [1, {}]]);
rea('react_clap', 1.6, [[0, {}], [0.2, { lShP: 1.3, rShP: 1.3, lElb: 1.2, rElb: 1.2 }], [0.35, { lShP: 1.3, rShP: 1.3, lElb: 1.6, rElb: 1.6 }], [0.5, { lShP: 1.3, rShP: 1.3, lElb: 1.2, rElb: 1.2 }], [0.65, { lShP: 1.3, rShP: 1.3, lElb: 1.6, rElb: 1.6 }], [1, {}]]);
rea('react_instruct', 1.6, [[0, {}], [0.25, { rShP: 1.5, rElb: 0.05, spineTwist: -0.25, headYaw: -0.3, lShP: 0.5, lShA: 0.4 }], [0.6, { rShP: 1.6, rElb: 0.05, spineTwist: -0.25, headYaw: -0.3 }], [1, {}]]);
rea('react_argue', 1.6, [[0, {}], [0.2, { rootPitch: 0.2, lShP: 1.1, rShP: 1.1, lShA: 0.5, rShA: 0.5, lElb: 0.9, rElb: 0.9, headPitch: 0.1 }], [0.5, { rootPitch: 0.25, lShP: 1.3, rShP: 0.9, lShA: 0.5, rShA: 0.7, headYaw: 0.4 }], [0.8, { rootPitch: 0.2, lShP: 1.1, rShP: 1.1, headYaw: -0.4 }], [1, {}]]);
rea('react_shrug', 1.4, [[0, {}], [0.3, { lShA: 0.6, rShA: 0.6, lShP: 0.6, rShP: 0.6, lElb: 1.5, rElb: 1.5, headPitch: -0.05, rootY: 0.03 }], [0.8, { lShA: 0.6, rShA: 0.6, lShP: 0.6, rShP: 0.6, lElb: 1.5, rElb: 1.5 }], [1, {}]]);
rea('react_angry_kick', 1.0, [[0, {}], [0.4, { rHip: -0.7, rKnee: 1.0, lShA: 0.5, rShA: 0.5, spinePitch: 0.1 }], [0.55, { rHip: 1.0, rKnee: 0.2, rootPitch: 0.15 }], [1, {}]]);
rea('react_cheer_bench', 1.6, [[0, {}], [0.2, { lShP: 2.8, rShP: 2.8, rootY: 0.2, lKnee: 0.4, rKnee: 0.4 }], [0.4, { lShP: 2.6, rShP: 2.6, rootY: 0.05 }], [0.6, { lShP: 2.8, rShP: 2.8, rootY: 0.2 }], [1, {}]]);
rea('react_hands_hips', 1.6, [[0, {}], [0.25, { lShP: 0.2, rShP: 0.2, lShA: 0.8, rShA: 0.8, lElb: 1.4, rElb: 1.4, headPitch: 0.05 }], [1, { lShP: 0.2, rShP: 0.2, lShA: 0.8, rShA: 0.8, lElb: 1.4, rElb: 1.4 }]]);
rea('react_tired', 1.8, [[0, {}], [0.3, { rootPitch: 0.6, spinePitch: 0.3, lShP: 0.9, rShP: 0.9, lElb: 0.1, rElb: 0.1, lKnee: 0.4, rKnee: 0.4, headPitch: 0.3, rootY: -0.1 }], [1, { rootPitch: 0.62, spinePitch: 0.3, lShP: 0.9, rShP: 0.9, lKnee: 0.4, rKnee: 0.4, headPitch: 0.3, rootY: -0.1 }]]);
rea('react_wave_off', 1.2, [[0, {}], [0.25, { rShP: 1.8, rElb: 0.4, headYaw: 0.2 }], [0.5, { rShP: 1.8, rElb: 0.1, headYaw: -0.2 }], [0.75, { rShP: 1.8, rElb: 0.4 }], [1, {}]]);

/* ---------------------------- lesão e outros (8) ---------------------------- */
const oth = (name: string, dur: number, keys: [number, K][]) => add('lesao', name, dur, 0, keys);
oth('injured_hold', 2.0, [[0, {}], [0.3, { rootPitch: 0.4, rootY: -0.2, rShP: 0.6, rElb: 0.3, lShP: 0.5, lKnee: 0.5, rKnee: 0.8, rHip: 0.3, headPitch: 0.4 }], [1, { rootPitch: 0.4, rootY: -0.2, rShP: 0.6, rElb: 0.3, lShP: 0.5, lKnee: 0.5, rKnee: 0.8, rHip: 0.3, headPitch: 0.4 }]]);
oth('injured_roll', 2.0, [[0, { rootPitch: 1.5, rootY: -1.0 }], [0.3, { rootPitch: 1.5, rootY: -1.0, rootRoll: 0.7, lKnee: 0.9, rKnee: 0.4, lShP: 1.2 }], [0.6, { rootPitch: 1.5, rootY: -1.0, rootRoll: -0.7, lKnee: 0.4, rKnee: 0.9, lShP: 1.2 }], [1, { rootPitch: 1.5, rootY: -1.0, rootRoll: 0.7, lKnee: 0.9, rKnee: 0.4 }]]);
oth('limp_walk', 1.2, [[0, { rootPitch: 0.12, rHip: 0.2 }], [0.5, { rootPitch: 0.15, rHip: -0.1, rKnee: 0.35, rootRoll: 0.1, rootY: -0.05 }], [1, { rootPitch: 0.12, rHip: 0.2 }]]);
oth('shoelace', 1.6, [[0, {}], [0.3, { rootPitch: 0.8, rootY: -0.35, lKnee: 1.3, rKnee: 0.5, lHip: 1.0, rHip: 0.6, lShP: 1.6, rShP: 1.2, lElb: 0.6, spinePitch: 0.3, headPitch: 0.4 }], [1, { rootPitch: 0.8, rootY: -0.35, lKnee: 1.3, rKnee: 0.5, lHip: 1.0, rHip: 0.6, lShP: 1.6, rShP: 1.2, spinePitch: 0.3, headPitch: 0.4 }]]);
oth('drink', 1.6, [[0, {}], [0.3, { rShP: 1.4, rElb: 2.4, headPitch: -0.5, spinePitch: -0.15 }], [0.8, { rShP: 1.4, rElb: 2.4, headPitch: -0.55, spinePitch: -0.15 }], [1, {}]]);
oth('stretch', 2.0, [[0, {}], [0.3, { lShP: 2.9, rShP: 2.9, lShA: 0.2, rShA: 0.2, spinePitch: -0.2, headPitch: -0.2 }], [0.6, { lShP: 2.9, rShP: 2.9, spinePitch: 0.2, spineTwist: 0.3 }], [1, {}]]);

/* ---------------------------- bola parada (10) ---------------------------- */
const sp = (name: string, dur: number, strike: number, keys: [number, K][]) => add('bola-parada', name, dur, strike, keys);
sp('corner_runup', 1.2, 0.6, [[0, {}], [0.3, { lHip: 0.4, rHip: -0.3, rKnee: 0.5 }], [0.6, { rHip: -0.9, rKnee: 1.3, lKnee: 0.4, spineTwist: 0.25, lShA: 0.8, rShA: 0.8 }], [0.8, { rHip: 1.2, rKnee: 0.1, rootPitch: -0.12, spineTwist: -0.3 }], [1, {}]]);
sp('free_kick_runup', 1.3, 0.62, [[0, {}], [0.25, { lHip: 0.5, rHip: -0.4, rKnee: 0.6, rootPitch: 0.1 }], [0.6, { rHip: -0.9, rKnee: 1.3, lKnee: 0.4, spineTwist: 0.3, lShA: 0.9, rShA: 0.9, headPitch: 0.3 }], [0.8, { rHip: 1.2, rKnee: 0.1, rootPitch: 0.1, spineTwist: -0.3 }], [1, {}]]);
sp('pen_runup', 1.4, 0.65, [[0, {}], [0.3, { lHip: 0.4, rHip: -0.3, rKnee: 0.5, headPitch: 0.3 }], [0.6, { rHip: -0.8, rKnee: 1.2, lKnee: 0.4, spineTwist: 0.2, lShA: 0.8, rShA: 0.8, headPitch: 0.35 }], [0.8, { rHip: 1.15, rKnee: 0.1, rootPitch: 0.12, spineTwist: -0.25 }], [1, {}]]);
sp('pen_wait', 1.8, 0, [[0, {}], [0.3, { rootPitch: 0.1, lShP: 0.3, rShP: 0.3, lElb: 0.6, rElb: 0.6, headPitch: 0.15 }], [1, { rootPitch: 0.1, lShP: 0.3, rShP: 0.3, lElb: 0.6, rElb: 0.6, headPitch: 0.15 }]]);
sp('wall_jump', 0.8, 0.5, [[0, {}], [0.3, { lShP: 0.5, rShP: 0.5, lElb: 0.9, rElb: 0.9, lKnee: 0.8, rKnee: 0.8 }], [0.55, { rootY: 0.4, lShP: 0.5, rShP: 0.5, lElb: 0.9, rElb: 0.9, lKnee: 0.9, rKnee: 0.9 }], [1, {}]]);
sp('goalkick_wait', 1.6, 0, [[0, {}], [0.3, { lShA: 0.6, rShA: 0.6, lElb: 0.7, rElb: 0.7, lKnee: 0.2, rKnee: 0.2 }], [1, { lShA: 0.6, rShA: 0.6, lElb: 0.7, rElb: 0.7, lKnee: 0.2, rKnee: 0.2 }]]);
sp('kickoff_ready', 1.6, 0, [[0, {}], [0.3, { rootPitch: 0.15, lKnee: 0.3, rKnee: 0.3, lShP: 0.4, rShP: 0.4, lElb: 0.6, rElb: 0.6, headPitch: 0.1 }], [1, { rootPitch: 0.15, lKnee: 0.3, rKnee: 0.3, lShP: 0.4, rShP: 0.4, lElb: 0.6, rElb: 0.6 }]]);
sp('corner_signal', 1.2, 0, [[0, {}], [0.3, { rShP: 2.9, rElb: 0.05, headYaw: -0.3 }], [0.7, { rShP: 2.9, rElb: 0.05 }], [1, {}]]);
sp('restart_look', 1.2, 0, [[0, {}], [0.3, { headYaw: 0.7, spineTwist: 0.2 }], [0.7, { headYaw: -0.7, spineTwist: -0.2 }], [1, {}]]);

/* ---------------------------- cerimônia: entrada e hino (12) ---------------------------- */
const cer = (name: string, dur: number, keys: [number, K][]) => add('cerimonia', name, dur, 0, keys);
const CHEST: K = { rShP: 0.95, rShA: -0.15, rElb: 2.5, lShP: 0.05, lShA: 0.08, headPitch: -0.12, spinePitch: -0.04 };
const BACK: K = { lShP: -0.55, rShP: -0.55, lShA: -0.12, rShA: -0.12, lElb: 0.25, rElb: 0.25, spinePitch: -0.04, headPitch: -0.12 };
const FRONT: K = { lShP: 0.75, rShP: 0.75, lShA: 0.05, rShA: 0.05, lElb: 0.95, rElb: 0.95, spinePitch: -0.02, headPitch: -0.1 };
const sway = (base: K): [number, K][] => [[0, {}], [0.12, base], [0.4, { ...base, rootRoll: 0.015, rootY: 0.005 }], [0.7, { ...base, rootRoll: -0.015, rootY: 0.005 }], [0.95, base], [1, {}]];
cer('anthem_chest', 24, sway(CHEST));
cer('anthem_back', 24, sway(BACK));
cer('anthem_front', 24, sway(FRONT));
cer('anthem_arm_shoulder', 24, sway({ lShP: 0.35, lShA: 1.05, lElb: 0.15, rShP: 0.35, rShA: 1.05, rElb: 0.15, headPitch: -0.1 }));
cer('walk_out', 2.4, [[0, { lShP: 0.1, rShP: -0.1, headPitch: -0.05 }], [1, { lShP: 0.1, rShP: -0.1, headPitch: -0.05 }]]);
cer('wave_crowd', 2.4, [[0, {}], [0.2, { rShP: 2.4, rShA: 0.5, rElb: 0.3, headYaw: -0.2 }], [0.4, { rShP: 2.4, rShA: 0.9, rElb: 0.5 }], [0.6, { rShP: 2.4, rShA: 0.5, rElb: 0.3 }], [0.8, { rShP: 2.4, rShA: 0.9, rElb: 0.5 }], [1, {}]]);
cer('applaud_crowd', 2.4, [[0, {}], [0.15, { lShP: 1.3, rShP: 1.3, lElb: 1.2, rElb: 1.2 }], [0.3, { lShP: 1.3, rShP: 1.3, lElb: 1.6, rElb: 1.6 }], [0.45, { lShP: 1.3, rShP: 1.3, lElb: 1.2, rElb: 1.2 }], [0.6, { lShP: 1.3, rShP: 1.3, lElb: 1.6, rElb: 1.6 }], [0.8, { lShP: 1.3, rShP: 1.3, lElb: 1.2, rElb: 1.2 }], [1, {}]]);
cer('handshake', 1.6, [[0, {}], [0.3, { rShP: 1.2, rElb: 0.5, rShA: 0.1, spinePitch: 0.05 }], [0.5, { rShP: 1.2, rElb: 0.7, rootY: -0.01 }], [0.7, { rShP: 1.2, rElb: 0.4 }], [1, {}]]);
cer('coin_toss', 1.6, [[0, {}], [0.3, { rShP: 1.1, rElb: 1.5, headPitch: 0.3 }], [0.5, { rShP: 1.7, rElb: 0.7, headPitch: -0.2 }], [1, {}]]);
cer('stretch_pre', 2.0, [[0, {}], [0.3, { rootPitch: 0.6, spinePitch: 0.5, lShP: 1.0, rShP: 1.0, lKnee: 0.1, rKnee: 0.1 }], [0.6, { lShP: 2.9, rShP: 2.9, spinePitch: -0.2 }], [1, {}]]);
cer('mascot_pose', 2.0, [[0, {}], [0.3, { lShP: 1.4, rShP: 1.4, lShA: 0.4, rShA: 0.4, lElb: 0.6, rElb: 0.6, rootY: 0.05 }], [1, { lShP: 1.4, rShP: 1.4, lShA: 0.4, rShA: 0.4, lElb: 0.6, rElb: 0.6 }]]);

/* ---------------------------- arbitragem (12) ---------------------------- */
const ref = (name: string, dur: number, keys: [number, K][]) => add('arbitragem', name, dur, 0, keys);
ref('ref_spot', 1.4, [[0, {}], [0.25, { rShP: 1.2, rElb: 0.05, rootPitch: 0.15, headPitch: 0.3, spineTwist: -0.15 }], [0.8, { rShP: 1.2, rElb: 0.05, rootPitch: 0.15, headPitch: 0.3 }], [1, {}]]);
ref('ref_penalty', 1.4, [[0, {}], [0.25, { rShP: 1.5, rElb: 0.05, spineTwist: -0.3, rootPitch: 0.05 }], [0.8, { rShP: 1.5, rElb: 0.05, spineTwist: -0.3 }], [1, {}]]);
ref('ref_halt', 1.2, [[0, {}], [0.2, { rShP: 1.5, rShA: 0.1, rElb: 1.4 }], [0.8, { rShP: 1.5, rElb: 1.4 }], [1, {}]]);
ref('ref_wave_on', 1.2, [[0, {}], [0.2, { rShP: 1.4, rElb: 0.3 }], [0.4, { rShP: 1.4, rElb: 0.7 }], [0.6, { rShP: 1.4, rElb: 0.3 }], [1, {}]]);
ref('flag_goalkick', 1.4, [[0, {}], [0.15, { rShP: 1.6, rShA: 0.3, rElb: 0.05 }], [0.85, { rShP: 1.6, rShA: 0.3, rElb: 0.05 }], [1, {}]]);

/* ------------------------------------------------------------------ */

export const ANIMS = defs;
export type AnimName = string;
export const animNames = (): string[] => Object.keys(defs);
export const animGroup = (g: string): string[] => animNames().filter((n) => defs[n].group === g);
export const hasAnim = (n: string): boolean => n in defs;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smooth = (x: number) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const dense = new Map<string, Pose[]>();
const denseOf = (name: string): Pose[] => {
  let d = dense.get(name);
  if (!d) { d = defs[name].keys.map(([, k]) => { const p = newPose(); for (const [j, v] of Object.entries(k)) p[J[j as JointName]] = v as number; return p; }); dense.set(name, d); }
  return d;
};
const MIRROR: [number, number][] = [[J.lShP, J.rShP], [J.lShA, J.rShA], [J.lElb, J.rElb], [J.lHip, J.rHip], [J.lHipA, J.rHipA], [J.lKnee, J.rKnee], [J.lAnk, J.rAnk]];
/** Pose da animação `name` em `t` (0 a 1); `dir` -1 espelha para o lado esquerdo. */
export function sampleAnim(name: string, t: number, dir = 1): Pose {
  const def = defs[name], ps = denseOf(name), out = newPose();
  const keys = def.keys, tt = clamp01(t);
  let i = 0; while (i < keys.length - 2 && tt > keys[i + 1][0]) i++;
  const [t0] = keys[i], [t1] = keys[Math.min(i + 1, keys.length - 1)], a = ps[i], b = ps[Math.min(i + 1, keys.length - 1)];
  const u = t1 > t0 ? smooth((tt - t0) / (t1 - t0)) : 1;
  for (let j = 0; j < N_JOINTS; j++) out[j] = a[j] + (b[j] - a[j]) * (tt >= t1 && i === keys.length - 1 ? 1 : u);
  if (dir < 0) {
    for (const [l, r] of MIRROR) { const tmp = out[l]; out[l] = out[r]; out[r] = tmp; }
    out[J.rootRoll] = -out[J.rootRoll]; out[J.spineTwist] = -out[J.spineTwist]; out[J.headYaw] = -out[J.headYaw];
  }
  return out;
}
