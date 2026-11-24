window.WEBMEJI_HOST = "#webmeji-stage";

window.SPAWNING = [
  { id: "webmeji-stats", config: "SHIMEJI_CONFIG" }
];

window.SHIMEJI_CONFIG = {
  ALLOWANCES: ['pet', 'drag', 'bottom', 'top', 'left', 'right'],
  walkspeed: 50,
  fallspeed: 200,
  jumpspeed: 150,
  gettingupspeed: 2000,
  walk: {
    frames: ["assets/webmeji/shimeji/shime1.png", "assets/webmeji/shimeji/shime2.png", "assets/webmeji/shimeji/shime3.png", "assets/webmeji/shimeji/shime2.png"],
    interval: 175, loops: 6},

  stand: {
    frames: ["assets/webmeji/shimeji/shime1.png"],
    interval: 200, loops: 1},

  sit: {
    frames: ["assets/webmeji/shimeji/shime11.png"],
    interval: 1000, loops: 1,
    randomizeDuration: true, min: 3000, max: 11000},

  spin: {
    frames: ["assets/webmeji/shimeji/shime1.png"],
    interval: 150, loops: 3},

  dance: {
    frames: ["assets/webmeji/shimeji/shime5.png", "assets/webmeji/shimeji/shime6.png", "assets/webmeji/shimeji/shime1.png"],
    interval: 200, loops: 5},

  trip: {
    frames: ["assets/webmeji/shimeji/shime20.png", "assets/webmeji/shimeji/shime21.png", "assets/webmeji/shimeji/shime21.png", "assets/webmeji/shimeji/shime20.png", "assets/webmeji/shimeji/shime21.png", "assets/webmeji/shimeji/shime21.png"],
    interval: 250, loops: 1},

  forcewalk: { 
    loops: 6},

  forcethink: {
    frames: ["assets/webmeji/shimeji/shime27.png", "assets/webmeji/shimeji/shime28.png"],
    interval: 500, loops: 2},

  pet: {
    frames: ["assets/webmeji/shimeji/shime15.png", "assets/webmeji/shimeji/shime16.png", "assets/webmeji/shimeji/shime17.png"],
    interval: 75},

  drag: {
    frames: ["assets/webmeji/shimeji/shime5.png", "assets/webmeji/shimeji/shime7.png", "assets/webmeji/shimeji/shime5.png", "assets/webmeji/shimeji/shime6.png", "assets/webmeji/shimeji/shime8.png", "assets/webmeji/shimeji/shime6.png"],
    interval: 210},

  falling: {
    frames: ["assets/webmeji/shimeji/shime4.png"],
    interval: 200, loops: 2},

  fallen: {
    frames: ["assets/webmeji/shimeji/shime19.png", "assets/webmeji/shimeji/shime18.png"],
    interval: 250, loops: 1},

  ORIGINAL_ACTIONS: [
    'walk','walk','walk','walk','walk','walk',
    'walk','walk','walk','walk','walk','walk',
    'spin','spin','spin',
    'sit','sit',
    'dance','dance',
    'trip'
  ],

  EDGE_ACTIONS: [
    'hang',
    'climb','climb','climb','climb','climb','climb',
    'fall'
  ],

  JUMP_CHANCE: 0.5,


  climbSide: {
    frames: ["assets/webmeji/shimeji/shime13.png", "assets/webmeji/shimeji/shime14.png"],
    interval: 200, loops: 2},

  hangstillSide: {
    frames: ["assets/webmeji/shimeji/shime12.png"],
    interval: 200, loops: 2,
    randomizeDuration: true, min: 3000, max: 11000},

  climbTop: {
    frames: ["assets/webmeji/shimeji/shime24.png", "assets/webmeji/shimeji/shime25.png"],
    interval: 200, loops: 6},

  hangstillTop: {
    frames: ["assets/webmeji/shimeji/shime23.png"],
    interval: 200, loops: 2,
    randomizeDuration: true, min: 3000, max: 11000},

  jump: {
    frames: ["assets/webmeji/shimeji/shime22.png"],
    interval: 200}
};
