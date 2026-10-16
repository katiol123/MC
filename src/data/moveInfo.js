// Player-facing descriptions of every fighter's signature special and super (fighter card).
// Move names come from the move data itself (signatures.js); this file only explains them.
export const SIGNATURE_INPUT = '↓ ↙ ← + PUNCH';
export const SUPER_INPUT = '↓ ↘ → ↓ ↘ → + PUNCH (full meter)';

export const MOVE_INFO = {
  brick: {
    special: 'Leaps up and hammers down with both fists. An overhead: it cannot be blocked crouching, and it knocks down.',
    super: 'A relentless dockside beating: a long chain of heavy punches.',
  },
  rattigan: {
    special: 'Flicks a coin across the screen: a fast projectile that keeps rivals honest at range.',
    super: 'Teleports behind the rival and picks them clean with a flurry of blows.',
  },
  smiles: {
    special: 'A long sliding kick along the floor. Hits low and knocks down - block it crouching.',
    super: 'A storm of kicks delivered with a grin that never leaves his face.',
  },
  jax: {
    special: 'A sonic wave from the amp: a projectile that hits twice.',
    super: 'A mosh-pit barrage of punches finished with a kick.',
  },
  vellaro: {
    special: 'Counter stance: catches high and mid strikes and answers with a counter-attack. Lows go straight through it.',
    super: 'A tailored execution: quick jabs and crosses, finished with a lunge that sends the rival flying.',
  },
  roxy: {
    special: 'Three advancing kicks that push the rival into the corner.',
    super: 'A riot of strikes that ends in a spinning kick.',
  },
  bruno: {
    special: 'A command grab: Bruno drags the rival into his pot. It cannot be teched.',
    super: 'Serves the rival a beating with a cast-iron frying pan.',
  },
  jaguar: {
    special: 'A diving pounce from the air. An overhead: it cannot be blocked crouching.',
    super: 'Blots out the sun: a rush of jabs and crosses finished by a driving lunge.',
  },
  cinder: {
    special: 'A burst of fire from the palms at close range that hits twice.',
    super: 'A rush of flaming fists. Every hit sets the rival on fire for 10 s (5 damage every 0.5 s, up to 100) - the burn never finishes anyone, it leaves 1 HP.',
  },
  grizz: {
    special: 'A shoulder charge with armor: shrugs off one hit (half damage, no flinch) and keeps going. Supers and throws break the armor.',
    super: 'A frenzy of clawed swipes ending with a two-paw smash from above. Leaves claw marks.',
  },
  hawk: {
    special: 'Casts a hook on a fishing line from long range and reels the rival in, leaving them open for a follow-up.',
    super: 'A chain of strikes; every hit that lands heals him for half of the damage dealt.',
  },
  tao: {
    special: 'Six lightning punches with ghost fists. The final palm breaks the guard: a blocking rival staggers.',
    super: 'A very long barrage that grants FOCUS: a golden aura and +30 % damage for 8 seconds.',
  },
  goro: {
    special: 'A sumo stomp that sends a shock wave along the boards. Hits low (block crouching or jump it) and has one hit of armor.',
    super: 'Open-palm slaps finished by a full-body sumo charge.',
  },
  sobby: {
    special: 'A cream pie in the face: a long stun, and while the cream is on (4 s) the rival moves 15 % slower and winds up attacks about 20 % longer.',
    super: 'Slaps and kicks through the tears, finished by a boxing glove on a spring.',
  },
  snapper: {
    special: 'A spinning death roll: a full-body rush with the tail that knocks down.',
    super: 'Four snapping bites and a spinning tail strike.',
  },
  chuy: {
    special: 'A strummed chord: three notes float across the screen, three hits.',
    super: 'The guitar comes off his back and he plays it on the rival - it ends in splinters.',
  },
};

/** What each attribute does, in detail (fighter card, click an attribute). */
export const ATTRIBUTE_INFO = {
  power: 'Damage of every attack: normals, specials, throws and the super are all scaled by it. The strongest fighter in the roster hits about 5 % harder than the weakest. Stamina affects it (BODY bar).',
  speed: 'How fast attacks come out. It scales the start-up frames of the single-hit attacks (lower is faster): faster pokes win exchanges, punish more mistakes and are harder to react to. Multi-hit sequences and the super keep their timing.',
  mobility: 'Walking speed, and with it running, dashing and jump distance. It also sets agility: how quickly the fighter lands, wakes up after a knockdown and recovers. Mobile fighters control space and escape corners.',
  health: 'Hit points per round. More health means more hits needed to finish the round.',
  toughness: 'Size of the stun (dizzy) meter. Every hit fills it; when it is full the fighter is DIZZY and wide open (and the rival may showboat). Tough fighters can take long combos without getting dizzy.',
  reaction: 'CPU only. How many frames the CPU needs to see an attack coming, and how often it blocks it. Low reaction gets hit by things it should have blocked. Morale affects all CHARACTER bars.',
  aggression: 'CPU only. How much the CPU presses forward, attacks and how short its pauses between decisions are. Aggressive fighters also showboat more often and their managers like throwing parties.',
  combo: 'CPU only. Chance to continue a landed hit into a combo and to punish a rival who whiffed or showboats.',
  antiAir: 'CPU only. How reliably the CPU meets a jump-in with an uppercut, or at least blocks it.',
  cunning: 'CPU only. Throws, throw escapes (teching) and well-timed signature specials. Cunning fighters rarely showboat, and their managers keep a bigger fame reserve and invest in their strengths.',
};
