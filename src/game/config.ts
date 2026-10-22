// All the game's tuning numbers live here, so you can tweak the feel of the
// game without hunting through the code. Stats always go from 0 (empty) to
// 100 (full). "per hour" rates are spread evenly across each minute.

export const CONFIG = {
  // How big one simulation step is. simulate() walks forward in steps of this
  // size, so 1 minute means "check the pet once per in-game minute".
  tickMinutes: 1,

  // How often the open game re-runs simulate(), in seconds.
  liveUpdateSeconds: 5,
  // Coming back after at least this long shows a "While you were away"
  // card, if anything happened.
  awayCardMinutes: 30,

  // How long the pet's eating / happy animation plays after you feed or
  // play with it, in milliseconds.
  reactionMs: 1400,

  // Eating takes longer: the food sits in front of the pet and goes in
  // `bites` bites over `ms` milliseconds.
  eating: { ms: 2800, bites: 4 },

  // Pets with an idle set (see public/sprites/manifest.json) play one of its
  // moves, like a stretch or a look around, about this often while they're
  // idle or cheerful, in milliseconds. Each break comes up to 3 seconds
  // later than this, at random.
  idleMoveEveryMs: 9000,

  // Starting values for a brand new pet.
  startingStats: {
    hunger: 80, // 100 = completely full, 0 = starving
    happiness: 80, // 100 = overjoyed, 0 = miserable
    health: 100, // 100 = in perfect health
    energy: 80, // 100 = full of beans, 0 = exhausted
  },

  // Growing up. How many hours the pet spends in each stage before moving
  // on (adults stay adults). Use the fast-forward and "Grow up now" testing
  // tools in Settings to try this without waiting days.
  growth: {
    stageHours: {
      egg: 0.5, // the egg hatches after 30 minutes
      baby: 24, // a baby for 1 day
      teen: 72, // a teen for 3 days, then an adult
    },
    // Babies get hungry and bored faster; adults a bit slower. Eggs don't
    // need anything at all.
    decayMultiplier: {
      egg: 0,
      baby: 1.25,
      teen: 1,
      adult: 0.9,
    },
  },

  // Which character a teen grows into. First the game rolls a star rarity
  // using the Care Score at that moment, then picks a theme at random among
  // the characters of that rarity (see src/data/characters.json).
  // Each row: the lowest Care Score for that row, then the chance (percent)
  // of 1, 2 and 3 stars. If no character has the rolled rarity, the next
  // lower rarity is used (every theme has all three today).
  rarity: [
    { minCare: 80, odds: { 1: 10, 2: 40, 3: 50 } },
    { minCare: 50, odds: { 1: 30, 2: 50, 3: 20 } },
    { minCare: 20, odds: { 1: 60, 2: 35, 3: 5 } },
    { minCare: 0, odds: { 1: 90, 2: 10, 3: 0 } },
  ],
  // The same, for a little one whose parents both grew into 3-star
  // characters: never 1 star, and good care makes 3 stars likely.
  rarityStarParents: [
    { minCare: 80, odds: { 1: 0, 2: 20, 3: 80 } },
    { minCare: 50, odds: { 1: 0, 2: 35, 3: 65 } },
    { minCare: 20, odds: { 1: 0, 2: 50, 3: 50 } },
    { minCare: 0, odds: { 1: 0, 2: 65, 3: 35 } },
  ],

  // How many points each stat loses per hour while awake, when nothing else
  // is going on. 4/hour means a full tummy empties in about 25 hours.
  decayPerHour: {
    hunger: 4,
    happiness: 3,
    health: 0.5,
    energy: 3,
  },

  // A stat below this counts as "low": the pet looks sad, and if it stays low
  // the pet gets a warning and later becomes sick.
  lowStatThreshold: 30,

  // A stat at or above this counts as "well looked after".
  goodStatThreshold: 50,

  // When happiness is at least this (and nothing is wrong), the pet shows
  // its calm "cheerful" animation instead of the normal idle one.
  cheerfulHappiness: 70,

  sleep: {
    bedtimeHour: 21, // night starts at 9pm (your device's local time)
    wakeHour: 8, // and ends at 8am; a sleeping pet wakes up by itself then
    energyPerHourAsleep: 12, // energy regained per hour of sleep
    decayMultiplierAsleep: 0.5, // hunger and joy drop at half speed while asleep
    energyMultiplierNightAwake: 2, // staying up late with the lights on is tiring
  },

  health: {
    neglectDecayPerHour: 2, // extra health lost per hour while a stat is low
    sickDecayPerHour: 2, // extra health lost per hour while sick
    recoverPerHourWhenCared: 1.5, // health gained per hour when tummy and joy are good
  },

  sickness: {
    // How long the pet shows the warning (with low stats) before it gets sick.
    // The warning always comes first: a pet can never go straight to sick.
    warningHoursBeforeSick: 3,
    sickJoyMultiplier: 1.5, // joy drops 50% faster while sick
    medicineHealth: 40, // health restored by one dose of medicine
    // After medicine the pet rests. It can't play mini-games or breed, and it
    // can't get sick again, but feeding and cuddling still work.
    recoveryHours: 6,
    // A pet left sick this long without medicine passes away. It stays in
    // the room, greyed out, until a Revival Star brings it back or you say
    // goodbye. With the warning first, that's over a day of neglect.
    hoursBeforePassing: 24,
    // In its last hours the banner turns urgent and counts down.
    criticalHours: 6,
  },

  // Bringing a pet back after it passed away. It wakes up a bit weak,
  // with these stats (at least), and rests like it does after medicine.
  // A Revival Star can always be earned: `perStar` star fragments make
  // one, and every `careDaysPerFragment` good care days (days you visit
  // and no pet gets a warning, see src/game/fragments.ts) give a fragment.
  revival: {
    stats: { hunger: 60, happiness: 60, health: 60, energy: 60 },
    fragments: { perStar: 5, careDaysPerFragment: 6 },
  },

  // Revival Stars bought with real money, sold calmly as "a star in your
  // pocket" in the Shop (never next to the dying countdown). `price` is
  // shown as it is; buying is only a stand-in for now (see src/payments.ts).
  store: [
    { id: 'revival1', item: 'revivalStar', count: 1, price: '€0.99' },
    { id: 'revival3', item: 'revivalStar', count: 3, price: '€1.99' },
  ],

  // The hidden Care Score (0-100) tracks long-term care. Later it decides
  // which adult form the pet grows into.
  careScore: {
    start: 50,
    gainPerHourWhenCared: 0.5, // all stats good and not sick
    lossPerHourWhenNeglected: 1, // any stat low
    lossPerHourWhenSick: 1.5,
  },

  // What's inside the Feed panel. Each food changes stats by these amounts.
  // A food can also have a timed effect: `slowHunger` makes the tummy empty
  // more slowly (by `percent`) for a number of `hours`.
  // `price` is the cost in gold in the Shop. Food with price 0 is free and
  // never runs out; other food comes from your inventory, one per meal.
  // `caughtOnly` food isn't sold in the Shop: you get it by fishing. Its
  // `stars` (1-3) say how rare and good it is.
  // `grownOnly` food isn't sold either: you grow it in the garden (see
  // `garden` below).
  // `cookedOnly` food isn't sold either: you make it in the cooking pot
  // (see `cooking` below). Cooked dishes are worth more than eating their
  // ingredients one by one.
  foods: [
    { id: 'riceBall', price: 0, hunger: 20, happiness: 0, health: 0 },
    { id: 'strawberry', price: 10, hunger: 10, happiness: 6, health: 0 },
    { id: 'warmMilk', price: 12, hunger: 12, happiness: 0, health: 3 },
    { id: 'cookie', price: 8, hunger: 6, happiness: 12, health: -2 },
    { id: 'shrimp', price: 10, hunger: 10, happiness: 4, health: 0, caughtOnly: true, stars: 1 },
    { id: 'salmon', price: 20, hunger: 20, happiness: 6, health: 3, caughtOnly: true, stars: 2 },
    { id: 'lobster', price: 40, hunger: 28, happiness: 14, health: 5, caughtOnly: true, stars: 3 },
    { id: 'carrot', price: 10, hunger: 10, happiness: 0, health: 3, grownOnly: true, stars: 1 },
    { id: 'pumpkin', price: 20, hunger: 20, happiness: 6, health: 4, grownOnly: true, stars: 2 },
    { id: 'dragonFruit', price: 40, hunger: 16, happiness: 16, health: 6, grownOnly: true, stars: 3 },
    { id: 'grilledShrimp', price: 14, hunger: 16, happiness: 6, health: 2, cookedOnly: true, stars: 1 },
    { id: 'shrimpOnigiri', price: 18, hunger: 36, happiness: 6, health: 2, cookedOnly: true, stars: 1 },
    { id: 'strawberryMilk', price: 26, hunger: 26, happiness: 12, health: 4, cookedOnly: true, stars: 1 },
    { id: 'grilledSalmon', price: 26, hunger: 28, happiness: 8, health: 5, cookedOnly: true, stars: 2 },
    { id: 'salmonSushi', price: 30, hunger: 46, happiness: 10, health: 5, cookedOnly: true, stars: 2 },
    { id: 'fishSoup', price: 38, hunger: 38, happiness: 8, health: 10, cookedOnly: true, stars: 2, slowHunger: { percent: 15, hours: 4 } },
    { id: 'berryShortcake', price: 36, hunger: 30, happiness: 26, health: 2, cookedOnly: true, stars: 2 },
    { id: 'lobsterBisque', price: 60, hunger: 46, happiness: 20, health: 12, cookedOnly: true, stars: 3, slowHunger: { percent: 20, hours: 6 } },
    { id: 'veggieOnigiri', price: 16, hunger: 30, happiness: 0, health: 4, cookedOnly: true, stars: 1 },
    { id: 'carrotSoup', price: 18, hunger: 24, happiness: 0, health: 8, cookedOnly: true, stars: 1 },
    { id: 'pumpkinSoup', price: 32, hunger: 34, happiness: 6, health: 10, cookedOnly: true, stars: 2 },
    { id: 'pumpkinPie', price: 40, hunger: 34, happiness: 24, health: 4, cookedOnly: true, stars: 2 },
    { id: 'heartyStew', price: 55, hunger: 54, happiness: 8, health: 12, cookedOnly: true, stars: 2, slowHunger: { percent: 20, hours: 6 } },
    { id: 'dragonFruitTart', price: 60, hunger: 30, happiness: 34, health: 6, cookedOnly: true, stars: 3 },
    { id: 'dragonFruitSmoothie', price: 70, hunger: 34, happiness: 30, health: 14, cookedOnly: true, stars: 3 },
    { id: 'seafoodPlatter', price: 85, hunger: 66, happiness: 30, health: 12, cookedOnly: true, stars: 3, slowHunger: { percent: 30, hours: 8 } },
    // A pick-me-up: lots of energy, so the pet can fish and play longer.
    // `limited` food isn't in the Shop every day (see `economy.limited`),
    // and Percy sometimes leaves one after a gold-frame order.
    { id: 'energyDrink', price: 35, hunger: 0, happiness: 4, health: -2, energy: 40, limited: true },
    // `foundOnly` food isn't sold or grown: a pet brings it home from a
    // journey, one kind per place (see `journeys` below). There are no
    // seeds for these.
    { id: 'honey', price: 15, hunger: 8, happiness: 8, health: 2, foundOnly: true, stars: 1 },
    { id: 'wildMushroom', price: 15, hunger: 10, happiness: 0, health: 6, foundOnly: true, stars: 1 },
    { id: 'glowSalt', price: 20, hunger: 2, happiness: 4, health: 6, foundOnly: true, stars: 2 },
    { id: 'stardustSugar', price: 25, hunger: 4, happiness: 14, health: 0, foundOnly: true, stars: 2 },
    // Dishes made with what journeys bring home.
    { id: 'honeyCake', price: 45, hunger: 30, happiness: 26, health: 4, cookedOnly: true, stars: 2 },
    { id: 'mushroomSoup', price: 45, hunger: 36, happiness: 6, health: 14, cookedOnly: true, stars: 2, slowHunger: { percent: 15, hours: 4 } },
    { id: 'glowSalmon', price: 55, hunger: 34, happiness: 12, health: 12, cookedOnly: true, stars: 2 },
    { id: 'stardustPudding', price: 80, hunger: 32, happiness: 36, health: 6, cookedOnly: true, stars: 3 },
    // What you get when the pot holds a mix that isn't a recipe.
    { id: 'mushyMess', price: 1, hunger: 8, happiness: 0, health: 0, cookedOnly: true },
  ],

  // The quick ones at the top of the Play panel. Playing costs energy and
  // makes the pet a little peckish. Mini-games like fishing come after.
  // Tapping the pet cuddles it too.
  activities: [
    { id: 'cuddle', happiness: 10, hunger: 0, energy: -2 },
    { id: 'tickle', happiness: 14, hunger: -2, energy: -5 },
  ],

  // Tapping the pet cuddles it; holding it opens the Wardrobe. A tap
  // within `tapCooldownMs` of the last cuddle is ignored, so a burst of
  // taps is one cuddle.
  petting: {
    holdMs: 500,
    tapCooldownMs: 1400,
  },

  // The fishing mini-game (in the Play panel). Cast, wait for a bite, tap
  // Reel in, then hold Pull to keep the dot on the green stripe until the
  // catch meter fills (see src/game/fishing.ts).
  fishing: {
    energyPerCast: 3, // each cast tires the pet a little
    biteAfterSeconds: { min: 4, max: 10 }, // how long until a fish bites
    biteWindowSeconds: 1.6, // how long you have to tap Reel in after a bite
    // How wide each coloured zone is, as a share of the bar. The green
    // stripe sits in the middle, with yellow on both sides, then red; the
    // rest of the bar is blue (no catch).
    zoneWidths: { perfect: 0.16, good: 0.08, weak: 0.07 },
    // Reeling in. Speeds are in bar widths per second.
    reel: {
      pull: 1.5, // how hard holding Pull drags the dot right
      drift: 1.0, // how hard it drifts back left when you let go
      maxSpeed: 0.5,
      shiftEverySeconds: { min: 2.5, max: 3.5 }, // how often the zones slide
      shiftBy: { min: 0.1, max: 0.22 }, // how far they slide each time
      glideSeconds: 0.6, // how long a slide takes
      // For this long at the start the meter doesn't drain, and only time
      // on green counts toward the grade (the dot is still getting there).
      graceSeconds: 2,
      meterStart: 0.3, // the catch meter starts this full
      fill: 0.16, // meter gained per second on a coloured zone
      drain: 0.15, // meter lost per second on blue
      // A landed catch is perfect if at least this share of the time on
      // the coloured zones was on green, good if on green or yellow.
      gradeShare: 0.5,
    },
    // The chance (0-1) that a fish is landed for each kind of catch.
    catchChance: { perfect: 1, good: 0.75, weak: 0.3, miss: 0 },
    // What you catch, in percent. A perfect catch makes the rarer ones
    // more likely.
    catchOdds: {
      perfect: { shrimp: 40, salmon: 40, lobster: 20 },
      other: { shrimp: 60, salmon: 30, lobster: 10 },
    },
    // How many fish one successful catch gives. A food buff could raise this
    // later on (e.g. a chance of an extra fish).
    fishPerCatch: 1,
    // Bait from the Shop. While you have some, each fish you land uses one
    // and is more likely to be a salmon or lobster (odds in percent).
    bait: {
      price: 12,
      catchOdds: {
        perfect: { shrimp: 20, salmon: 45, lobster: 35 },
        other: { shrimp: 35, salmon: 45, lobster: 20 },
      },
    },
  },

  // Cooking (the last row of the Feed panel). Put up to `slots` foods from
  // your inventory in the pot and tap Cook. If they match a recipe (in any
  // order) you get that dish, and the recipe shows up in the recipe book;
  // any other mix makes a Mushy mess. Each recipe's id is the dish it makes
  // (a food above).
  cooking: {
    slots: 3,
    // The foods that can go in the pot, in the order they're shown.
    ingredients: [
      'riceBall', 'strawberry', 'warmMilk', 'cookie',
      'shrimp', 'salmon', 'lobster',
      'carrot', 'pumpkin', 'dragonFruit',
      'honey', 'wildMushroom', 'glowSalt', 'stardustSugar',
    ],
    recipes: [
      { id: 'grilledShrimp', ingredients: ['shrimp'] },
      { id: 'shrimpOnigiri', ingredients: ['riceBall', 'shrimp'] },
      { id: 'strawberryMilk', ingredients: ['strawberry', 'warmMilk'] },
      { id: 'grilledSalmon', ingredients: ['salmon'] },
      { id: 'salmonSushi', ingredients: ['riceBall', 'salmon'] },
      { id: 'fishSoup', ingredients: ['salmon', 'warmMilk'] },
      { id: 'berryShortcake', ingredients: ['cookie', 'strawberry', 'warmMilk'] },
      { id: 'lobsterBisque', ingredients: ['lobster', 'warmMilk'] },
      { id: 'seafoodPlatter', ingredients: ['shrimp', 'salmon', 'lobster'] },
      { id: 'veggieOnigiri', ingredients: ['carrot', 'riceBall'] },
      { id: 'carrotSoup', ingredients: ['carrot', 'warmMilk'] },
      { id: 'pumpkinSoup', ingredients: ['pumpkin', 'warmMilk'] },
      { id: 'pumpkinPie', ingredients: ['pumpkin', 'cookie', 'warmMilk'] },
      { id: 'heartyStew', ingredients: ['carrot', 'pumpkin', 'salmon'] },
      { id: 'dragonFruitTart', ingredients: ['dragonFruit', 'cookie'] },
      { id: 'dragonFruitSmoothie', ingredients: ['dragonFruit', 'strawberry', 'warmMilk'] },
      { id: 'honeyCake', ingredients: ['honey', 'cookie', 'warmMilk'] },
      { id: 'mushroomSoup', ingredients: ['wildMushroom', 'carrot', 'warmMilk'] },
      { id: 'glowSalmon', ingredients: ['glowSalt', 'salmon'] },
      { id: 'stardustPudding', ingredients: ['stardustSugar', 'warmMilk', 'strawberry'] },
    ],
    mess: 'mushyMess',
  },

  // The garden (in the Play panel): pots to grow crops in. Plants grow in
  // real time, even while the game is closed. Times are in hours.
  garden: {
    plots: 2, // pots in a new garden (saves from before keep their 3)
    // One more pot can be bought in the Shop, up to `maxPlots`.
    maxPlots: 3,
    extraPotPrice: 250,
    // What you can grow. `id` is the food you harvest and `harvest` is how
    // many. `seedPrice` is the seed's price in the Shop (0: not sold, you
    // only find it by luck).
    crops: [
      { id: 'carrot', hours: 16, harvest: 3, seedPrice: 10 },
      { id: 'pumpkin', hours: 32, harvest: 2, seedPrice: 0 },
      { id: 'dragonFruit', hours: 48, harvest: 2, seedPrice: 0 },
    ],
    // Watering is free. The soil stays moist for `moistHours`, longer after
    // a perfect pour (`perfectPourBonus` is the share added, 0.1 = 10%).
    moistHours: 8,
    perfectPourBonus: 0.1,
    // Hold Water to pour: a meter fills in `fillSeconds`, and letting go
    // inside `band` (shares of the meter) is a perfect pour.
    pour: { fillSeconds: 1.6, band: { start: 0.62, end: 0.82 } },
    // Once the soil is dry, every `dryHoursPerRoll` hours there's a chance
    // the plant gets sick (lower while fertilized). A sick plant stops
    // growing until it's cured, and dies after `daysUntilDead` days.
    dryHoursPerRoll: 6,
    sickChance: 0.5,
    sickChanceFertilized: 0.25,
    daysUntilDead: 3,
    // Fertilizer: one pot grows `speedUp` faster for `hours` hours.
    fertilizer: { hours: 6, speedUp: 0.25 },
    // Prices in the Shop.
    supplies: { fertilizer: 15, plantCure: 20 },
    // The chance (0-1) of finding a seed: per landed fish, and per cuddle
    // or tickle. Which seed is picked by `seedOdds` (in percent); a perfect
    // catch makes the rarer ones more likely.
    seedChance: { fishing: 0.03, play: 0.01 },
    seedOdds: {
      perfect: { carrot: 40, pumpkin: 40, dragonFruit: 20 },
      other: { carrot: 60, pumpkin: 30, dragonFruit: 10 },
    },
  },

  // Delivery orders: Percy the pigeon announces an order of 1 to 3 things
  // you caught, grew or cooked, and comes back to pick them up. Times are in
  // hours; the pickup always lands in the daytime, between `daytime.from`
  // and `daytime.to` o'clock (your device's local time).
  delivery: {
    pickupHours: 24, // how long you have to fill an order
    daytime: { from: 9, to: 20 },
    nextOrderHours: 4, // the next order is announced this long after a pickup
    boxes: { min: 1, max: 3 },
    // How many of a thing Percy asks for, by its stars: [fewest, most].
    amounts: { 1: [2, 3], 2: [1, 2], 3: [1, 1] },
    // A full box pays this share of what its items are worth (their `price`
    // above). Filling every box adds `fullBonus` on top (0.25 = 25%).
    payShare: 0.8,
    fullBonus: 0.25,
    // A gold-frame pickup (every box full) leaves a seed behind `seedChance`
    // of the time (0.5 = half). Which seed is picked by `seedOdds` (percent):
    // only the ones the Shop doesn't sell.
    seedChance: 0.5,
    seedOdds: { pumpkin: 70, dragonFruit: 30 },
    // When there's no seed, he leaves an energy drink this often instead.
    drinkChance: 0.5,
  },
  // Regulars: characters who aren't pets but keep coming back (see
  // src/game/regulars.ts). Each has a score from 0 to 100, shown as 5
  // hearts like a friend's (`friends.heartPoints` each), and every new
  // heart brings a reward. Hearts never go back below one you've reached.
  regulars: {
    percy: {
      // Points per pickup, by its frame: bronze for one full box, silver
      // for two, gold for every box. A pickup with no full box loses one.
      gain: { none: -1, bronze: 1, silver: 2, gold: 3 },
      // What each heart brings, from the 1st to the 5th: a seed, a journey
      // bag or a wallpaper to keep, and from then on better numbers for his
      // orders (`payShare`, `seedChance`, `seedOdds` replace the ones in
      // `delivery`) and journeys (`restHours` replaces `journeys.percy`).
      rewards: [
        { seed: 'pumpkin' },
        { payShare: 0.85 },
        { bag: 'courier' },
        { seedChance: 0.65, seedOdds: { pumpkin: 55, dragonFruit: 45 }, wallpaper: 'postmark' },
        { restHours: 40 },
      ],
      // Saves from before regulars start with this many points for every
      // order already filled, up to `max`.
      backfill: { perOrder: 1, max: 40 },
    },
  },

  // Cravings: now and then the pet would love one particular thing, shown
  // in a thought bubble over its head. It can be anything you've had
  // before (a fish you caught, a crop you grew, a dish you cooked) or a
  // Shop treat, whether you have one right now or not, so keeping a varied
  // pantry pays off. Feeding it is never required. Times are in hours.
  craving: {
    lastsHours: 6, // how long the bubble stays if you don't feed it
    nextAfterHours: 3, // a new craving comes this long after the last one ends
    firstAfterHatchHours: 2, // a baby's first craving waits this long after hatching
    // What feeding the craved food gives on top of the food itself. Rarer
    // food gives a bigger gold tip, by its stars (0 for Shop food).
    reward: { happiness: 15, care: 2, gold: { 0: 5, 1: 10, 2: 20, 3: 35 } },
  },

  // Friends and the next generation (Play > Meet). Once you have a
  // grown-up pet, pets drop by one at a time: your friends at random times
  // through the day, and a new wanderer (a grown-up pet the game makes
  // itself) every couple of days. Meeting a pet and giving it gifts raises your
  // friend score with it (0-100, shown as 5 hearts, `heartPoints` each).
  // With enough hearts, two grown-ups can mingle, and that may bring a
  // little one: an egg for your room. Times are in hours.
  friends: {
    firstVisitHours: 1, // the first wanderer comes this soon after growing up
    wildEveryHours: 48, // then a new one every 2 days
    stayHours: 3, // each visitor stays this long
    // The break between one visitor leaving and the next arriving, picked
    // at random between these.
    gapHours: { min: 1, max: 3 },
    invitesPerDay: 1, // friends you can invite over yourself each day
    maxWild: 10, // how many wanderers you can keep as friends (online friends get their own 10 later)
    heartPoints: 20,
    // A meeting: score gained (only the first `perDay` meetings with a
    // friend each day count), and what it does to your pet's stats.
    meet: { score: 4, perDay: 3, happiness: 8, energy: -4 },
    // Gifts count in tenths of a heart (heartPoints / 10 each): one tenth
    // per `goldPerTenth` of the food's price (rounded, but always at least
    // one), counting up to `tenthsPerDay` from gifts per friend each day.
    gift: { goldPerTenth: 20, tenthsPerDay: 3 },
    // A friend who visited and left without meeting your pet loses this
    // much, but never a whole heart.
    missedVisit: 1,
    // Mingling needs this score (70 = hearts 70% full). The chance of a
    // little one goes up with the score (first row that fits, percent).
    // After a mingle the pair waits `waitDays` before the next one.
    mingle: {
      minScore: 70,
      chance: [
        { minScore: 100, chance: 80 },
        { minScore: 85, chance: 65 },
        { minScore: 70, chance: 50 },
      ],
      waitDays: 3,
    },
    // How many pets fit in the room. A little one past that means one of
    // the others retires into the Family Tree.
    maxPets: 2,
    // A little one favours its parents' themes when it grows up: this
    // share (percent) of the time it becomes a character of one of them,
    // otherwise any theme. Rarity still comes from the Care Score.
    parentThemeChance: 60,
    // Wanderers lean towards common characters (percent by stars), so
    // friends' pets stay the best route to rare little ones.
    wandererStars: { 1: 65, 2: 25, 3: 10 },
  },

  // Journeys (Play > Journeys, see src/game/journeys.ts). A teen or
  // grown-up pet goes out to one of the places for a while and comes home
  // with a backpack of finds. Three offers are on the board at a time; each
  // has a place and a rarity, and the rarity sets how long the trip is.
  journeys: {
    // Trip length (hours) by rarity.
    hours: { common: 1, rare: 4, epic: 10 },
    // The first offer on the board is always common, so there's always a
    // short trip. The other two are rare or epic, by these odds (percent).
    odds: { rare: 75, epic: 25 },
    // A taken offer is replaced this many hours later.
    refillHours: 4,
    // What a trip uses up. The lunchbox and the pet's own tummy and energy
    // have to cover it, with the pet still at or above the low line
    // (`lowStatThreshold`) when it's home. Only tummy and energy go down on
    // the way: joy and health stay put, and the pet can't get sick.
    cost: {
      common: { hunger: 8, energy: 10 },
      rare: { hunger: 25, energy: 30 },
      epic: { hunger: 55, energy: 60 },
    },
    // The lunchbox: a bento with two spots for food in the big compartment,
    // one for a drink (anything that gives energy) and one for a charm.
    lunch: { food: 2, drink: 1 },
    // Charms, bought in the Shop and used up on one trip, make it bring
    // home more: `extraFinds` more finds, `twoStar` added to the chance of
    // each find having 2 stars, or `threeStar` (by rarity) added to the
    // chance of a 3-star find.
    charms: [
      { id: 'clover', price: 60, extraFinds: 1 },
      { id: 'compass', price: 90, twoStar: 0.25 },
      { id: 'starCharm', price: 150, threeStar: { rare: 0.15, epic: 0.15 } },
    ],
    joy: { common: 4, rare: 8, epic: 12 }, // joy gained on the trip
    // A pet that's home again waits this share of the trip before going
    // out again (it can do everything else straight away).
    waitShare: 0.5,
    // How many finds a trip brings back, and the most stars they can have.
    // An epic trip turns one find into a 3-star find `threeStarChance` of
    // the time. A pet whose character is of the place's theme finds one more.
    finds: {
      common: { min: 1, max: 2, twoStarChance: 0 },
      rare: { min: 3, max: 4, twoStarChance: 0.4 },
      epic: { min: 5, max: 6, twoStarChance: 0.6 },
    },
    threeStarChance: 0.3,
    // The place's own ingredient: always one on rare and epic trips (two on
    // epic), and on common trips this often.
    ingredientChance: 0.35,
    // Percy can come along, if he's picked before setting off: halfway (or
    // when the trip is called off early) he flies home with the best find.
    // Then he rests for `restHours`, which the Shop can cut short for gold.
    percy: { restHours: 60, resetPrice: 150 },
    // The places, one per theme. Each opens with `opens` (see journeys.ts)
    // and has finds by stars: a food, a seed ("seed:pumpkin") or gold
    // ("gold:12").
    places: [
      {
        id: 'market', theme: 'basic', ingredient: 'honey', opens: 'start',
        finds: {
          1: ['strawberry', 'warmMilk', 'cookie', 'gold:10', 'seed:carrot'],
          2: ['gold:25', 'salmon', 'berryShortcake', 'seed:pumpkin'],
          3: ['gold:60', 'seed:dragonFruit', 'energyDrink'],
        },
      },
      {
        id: 'woods', theme: 'nature', ingredient: 'wildMushroom', opens: 'harvest',
        finds: {
          1: ['strawberry', 'carrot', 'seed:carrot', 'gold:8'],
          2: ['pumpkin', 'seed:pumpkin', 'gold:20'],
          3: ['dragonFruit', 'seed:dragonFruit'],
        },
      },
      {
        id: 'caves', theme: 'cave', ingredient: 'glowSalt', opens: 'fish',
        finds: {
          1: ['shrimp', 'warmMilk', 'gold:12'],
          2: ['salmon', 'gold:30'],
          3: ['lobster', 'gold:70'],
        },
      },
      {
        id: 'hill', theme: 'sparkle', ingredient: 'stardustSugar', opens: 'grownUp',
        finds: {
          1: ['cookie', 'strawberry', 'gold:12'],
          2: ['berryShortcake', 'gold:30', 'seed:pumpkin'],
          3: ['dragonFruitTart', 'seed:dragonFruit', 'gold:80'],
        },
      },
    ],
    // `opens: 'fish'` needs this many fish landed.
    fishToOpen: 10,
  },

  // Decorating the room, from the Shop: a wallpaper and window curtains.
  // Each is bought once, then you pick which to use. Every room starts
  // with the plain wallpaper and no curtains.
  room: {
    wallpapers: [
      { id: 'plain', price: 0 },
      { id: 'stripes', price: 120 },
      { id: 'dots', price: 150 },
      { id: 'checks', price: 180 },
      { id: 'stars', price: 240 },
      // Not sold: Percy gives it at 4 hearts (see `regulars`).
      { id: 'postmark', price: 0, earned: true },
    ],
    curtains: [
      { id: 'rose', price: 80 },
      { id: 'butter', price: 80 },
      { id: 'mint', price: 100 },
      { id: 'plum', price: 150 },
    ],
  },

  // Achievements (in the Collection): badges for doing something lots of
  // times. Each has three tiers, bronze, silver and gold, reached at these
  // counts. Raising a number later never takes a badge away.
  achievements: {
    fish: [10, 50, 200], // fish landed
    deliveries: [5, 25, 100], // Percy's orders picked up with at least one full box
    harvests: [10, 50, 150], // crops picked in the garden
    dishes: [10, 50, 150], // recipes cooked (a Mushy mess doesn't count)
    cravings: [5, 25, 100], // cravings treated with just the right food
    gifts: [5, 25, 100], // gifts given to friends
    littleOnes: [1, 3, 10], // little ones from mingling
    journeys: [5, 25, 100], // journeys finished (not called home early)
  },

  // Skills (in the menu, see src/game/skills.ts). Doing things earns Keeper
  // XP, each Keeper level gives a skill point, and points are spent on
  // skills. They belong to you, not the pet, so they carry over to every
  // pet you raise.
  skills: {
    // XP for each thing counted for an achievement (per one).
    xp: { fish: 3, deliveries: 5, harvests: 4, dishes: 3, cravings: 5, gifts: 2, littleOnes: 50, journeys: 8 },
    perfectFishXp: 2, // extra for a perfect catch (5 in all)
    deliveryXp: { bronze: 0, silver: 5, gold: 15 }, // extra for a fuller order (5 / 10 / 20 in all)
    grownUpXp: { 1: 20, 2: 40, 3: 80 }, // a pet growing up, by its stars
    badgeXp: { bronze: 25, silver: 50, gold: 100 },
    // Going from level n to n + 1 takes base + perLevel × n XP.
    level: { base: 60, perLevel: 20 },
    // Points for each rank of a skill: the 1st costs 1, the 2nd 2, the 3rd 3.
    rankCosts: [1, 2, 3],
    // Taking a tree's points back costs this much gold per point (the
    // first time is free).
    resetGoldPerPoint: 100,
    // The skills in each tree, and what one rank of each does.
    trees: {
      fishing: ['steadyHands', 'headStart', 'luckyLine'],
      garden: ['quickSprouts', 'deepRoots', 'hardyPlants'],
      kitchen: ['secondHelping', 'chefsNose', 'wasteNot'],
      care: ['gentleStart', 'goodHabits', 'cozyHome'],
    },
    perRank: {
      steadyHands: 0.1, // the green stripe is 10% wider
      headStart: 0.1, // the catch meter starts 10% fuller
      luckyLine: 5, // lobster 5% likelier (shrimp 5% less)
      quickSprouts: 0.08, // crops grow 8% faster
      deepRoots: 2, // soil stays wet 2 hours longer
      hardyPlants: 0.25, // a quarter less likely to get sick
      secondHelping: 0.1, // 10% chance a recipe makes 2
      chefsNose: 1, // one more ingredient of an unknown recipe shows (then its name)
      wasteNot: 0.25, // 25% chance a Mushy mess gives an ingredient back
      gentleStart: 5, // a new egg's Care Score starts 5 higher
      goodHabits: 0.15, // the Care Score rises 15% faster
      cozyHome: 0.05, // tummy and joy drop 5% slower
    },
  },

  // How many old messages the Messages page keeps.
  messagesKept: 60,

  // Gold. It's earned (mini-games arrive in Milestone 4, plus check-in
  // bonuses) and spent in the Shop. It can never be bought with real money.
  economy: {
    startingGold: 50,
    // Food in a brand new pet's pantry.
    startingFood: { strawberry: 2, cookie: 1 },
    // Coming back to check on your pet earns a little gold: more for the
    // first visit of the day, a bit for later visits at least
    // `minHoursBetween` apart, up to `maxPerDay` rewards a day.
    checkIn: { firstOfDay: 20, later: 5, minHoursBetween: 3, maxPerDay: 4 },
    // `limited` food (the energy drink) is only in the Shop on some days:
    // each day has this chance (0-1) of having it, and then only
    // `perDay` can be bought that day.
    limited: { chance: 0.3, perDay: 3 },
  },

  // Testing helpers shown in Settings. Turn off before releasing the game.
  debug: {
    showTools: true,
    fastForwardHours: [1, 6, 24],
    addGold: 100,
    // Buttons that set the Care Score, to test which characters appear.
    careScores: [10, 60, 90],
    friendScore: 20, // "+20 friendship" with every friend and the guest
  },
} as const;

export const STAT_MIN = 0;
export const STAT_MAX = 100;
