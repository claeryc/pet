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

  // Pets with a face layer pull faces (see src/game/expressions.ts). A
  // reaction face shows for `ms` of its kind, in milliseconds. A mood face
  // shows while a stat is below its number: crying and sad for joy, hungry
  // for tummy, sleepy for energy. Pouting shows once nobody has done
  // anything with the pet for `poutAfterMs` while the game is open. A
  // pet's trait can move these (src/data/traits.json).
  expressions: {
    ms: { happy: 1400, inLove: 2400, surprised: 1600, grumpy: 2400 },
    cryingBelow: 15,
    sadBelow: 30,
    hungryBelow: 30,
    sleepyBelow: 20,
    poutAfterMs: 240_000,
  },

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
  revival: {
    stats: { hunger: 60, happiness: 60, health: 60, energy: 60 },
  },

  // Star fragments (see src/game/fragments.ts): the one currency for
  // things money can also buy. They're earned by caring well: every good
  // care day (a day you visit and no pet gets a warning) gives `perGoodDay`,
  // and every Milestone badge gives `perMilestone`. They can also be bought
  // in packs (`store` below). `perStar` of them make a Revival Star, which
  // money can't buy directly. A daily player earns about 150 a month.
  fragments: { perGoodDay: 5, perMilestone: 25, perStar: 500 },

  // The Family Home: a second room with `friends.maxPets` more spots (see
  // src/game/rooms.ts). Pets there lose tummy, joy and energy at
  // `needsSpeed` of the usual rate; poop, baths and sickness don't change.
  // It costs `fragments` star fragments, or `price` in real money (only a
  // stand-in for now, see src/payments.ts).
  familyHome: { needsSpeed: 0.5, fragments: 300, price: '€2.99' },

  // The Meadow (see src/game/meadow.ts), where your pets go when they move
  // out. Nobody there gets hungry or sick. One of them drops by about every
  // `visitEveryHours` (the first one `firstVisitHours` after a pet moves
  // there), and only while it's visiting can it move back home. A pet you
  // said hi to in the last `hiDays` days is the next to come. `out` of them
  // are out in the Meadow scene at once. A pet coming home has `backStats`.
  // The keepsake a pet leaves depends on its good care days: `keepsakeDays`
  // for a keepsake from its world besides its portrait, `goldenDays` for a
  // golden one. The room has a frame and `shelf` spots to show them.
  meadow: {
    firstVisitHours: 48,
    visitEveryHours: 168,
    hiDays: 3,
    out: 4,
    backStats: { hunger: 80, happiness: 90, health: 100, energy: 80 },
    gift: { keepsakeDays: 7, goldenDays: 30 },
    shelf: 3,
  },

  // Star fragment packs, sold calmly in the Shop (never next to the dying
  // countdown). Only the biggest pack has a bonus. `price` is shown as it
  // is; buying is only a stand-in for now (see src/payments.ts).
  store: [
    { id: 'fragments100', fragments: 100, price: '€0.99' },
    { id: 'fragments300', fragments: 300, price: '€2.99' },
    { id: 'fragments650', fragments: 650, price: '€4.99' },
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
  // `price` is the cost in gold in the Shop. Food comes from your
  // inventory, one per meal (food with price 0 would be free and never run
  // out, but none is today).
  // `source` says where it comes from:
  //  - `shop`: bought in the Shop.
  //  - `staple`: the everyday fallback. The rice jar refills it for free
  //    (see `riceJar` below), so it's never a favourite, a craving or a gift.
  //  - `caught`: fishing. Its `stars` (1-3) say how rare and good it is.
  //  - `grown`: the garden (see `garden` below).
  //  - `found`: a pet brings it home from a journey (see `journeys` below).
  //  - `cooked`: made in the cooking pot (see `cooking` below). Cooked dishes
  //    are worth more than eating their ingredients one by one: a dish's
  //    price and its stats added up are its ingredients' × 1.25 for 1 or 2
  //    ingredients, × 1.4 for 3 (rounded), so the more work a dish is, the
  //    better it pays.
  //  - `prepped`: cut on the cutting board (a fillet from a fish). It's
  //    worth just what it was cut from, and only goes into recipes: it's
  //    never a favourite, a craving or one of Percy's orders.
  // Only `shop` and `staple` food is sold.
  // `tags` say what kind of food it is (a drink, a soup, something sweet…),
  // for things that care about the kind rather than one food.
  // `effects` are what a food does besides its stats. Most food has none,
  // and that's on purpose: an effect should feel special.
  //  - `slowHunger`: the tummy empties more slowly (by `percent`) for a
  //    number of `hours`.
  //  - `slowJoy`: the same for joy.
  //  - `steadyPaws`: fishing's green stripe is `percent` wider for `hours`.
  //  - `placeFind`: packed in the lunchbox for a trip to `place`, the pet
  //    finds one more thing there (only one such bonus counts per pet).
  // A pet has one timed effect at a time: eating another replaces it.
  // Nothing cooked gives energy: that's the energy drink's job.
  foods: [
    { id: 'riceBall', source: 'staple', price: 3, hunger: 15, happiness: 0, health: 0, tags: ['grain'] },
    { id: 'strawberry', source: 'shop', price: 10, hunger: 10, happiness: 6, health: 0, tags: ['fruit', 'sweet'] },
    { id: 'warmMilk', source: 'shop', price: 12, hunger: 12, happiness: 0, health: 3, tags: ['drink', 'dairy'] },
    { id: 'cookie', source: 'shop', price: 8, hunger: 6, happiness: 12, health: -2, tags: ['sweet'] },
    { id: 'shrimp', source: 'caught', price: 10, hunger: 10, happiness: 4, health: 0, stars: 1, tags: ['seafood'] },
    { id: 'salmon', source: 'caught', price: 20, hunger: 20, happiness: 6, health: 3, stars: 2, tags: ['seafood'] },
    { id: 'lobster', source: 'caught', price: 40, hunger: 28, happiness: 14, health: 5, stars: 3, tags: ['seafood'] },
    { id: 'salmonFillet', source: 'prepped', price: 20, hunger: 20, happiness: 6, health: 3, stars: 2, tags: ['seafood'] },
    { id: 'lobsterTail', source: 'prepped', price: 40, hunger: 28, happiness: 14, health: 5, stars: 3, tags: ['seafood'] },
    { id: 'carrot', source: 'grown', price: 10, hunger: 10, happiness: 0, health: 3, stars: 1, tags: ['veg'] },
    { id: 'pumpkin', source: 'grown', price: 20, hunger: 20, happiness: 6, health: 4, stars: 2, tags: ['veg'] },
    { id: 'dragonFruit', source: 'grown', price: 40, hunger: 16, happiness: 16, health: 6, stars: 3, tags: ['fruit'] },
    { id: 'grilledShrimp', source: 'cooked', price: 13, hunger: 12, happiness: 4, health: 1, stars: 1, tags: ['seafood'] },
    { id: 'shrimpOnigiri', source: 'cooked', price: 16, hunger: 30, happiness: 5, health: 2, stars: 1, tags: ['seafood', 'grain'] },
    { id: 'strawberryMilk', source: 'cooked', price: 28, hunger: 24, happiness: 11, health: 4, stars: 1, tags: ['drink', 'sweet'] },
    { id: 'grilledSalmon', source: 'cooked', price: 25, hunger: 25, happiness: 7, health: 4, stars: 2, tags: ['seafood'] },
    { id: 'salmonSushi', source: 'cooked', price: 29, hunger: 41, happiness: 9, health: 5, stars: 2, tags: ['seafood', 'grain'] },
    { id: 'fishSoup', source: 'cooked', price: 40, hunger: 37, happiness: 8, health: 10, stars: 2, tags: ['soup', 'seafood'], effects: [{ kind: 'slowHunger', percent: 15, hours: 4 }] },
    { id: 'berryShortcake', source: 'cooked', price: 42, hunger: 34, happiness: 29, health: 2, stars: 2, tags: ['sweet'], effects: [{ kind: 'slowJoy', percent: 20, hours: 4 }] },
    { id: 'lobsterBisque', source: 'cooked', price: 65, hunger: 46, happiness: 20, health: 12, stars: 3, tags: ['soup', 'seafood'], effects: [{ kind: 'slowHunger', percent: 20, hours: 6 }] },
    { id: 'veggieOnigiri', source: 'cooked', price: 16, hunger: 31, happiness: 0, health: 4, stars: 1, tags: ['veg', 'grain'] },
    { id: 'carrotSoup', source: 'cooked', price: 28, hunger: 26, happiness: 0, health: 9, stars: 1, tags: ['soup', 'veg'] },
    { id: 'pumpkinSoup', source: 'cooked', price: 40, hunger: 38, happiness: 7, health: 11, stars: 2, tags: ['soup', 'veg'] },
    { id: 'pumpkinPie', source: 'cooked', price: 56, hunger: 47, happiness: 33, health: 6, stars: 2, tags: ['sweet'] },
    { id: 'heartyStew', source: 'cooked', price: 70, hunger: 74, happiness: 11, health: 16, stars: 2, tags: ['soup'], effects: [{ kind: 'slowHunger', percent: 20, hours: 6 }] },
    { id: 'dragonFruitTart', source: 'cooked', price: 60, hunger: 29, happiness: 33, health: 6, stars: 3, tags: ['sweet', 'fruit'] },
    { id: 'dragonFruitSmoothie', source: 'cooked', price: 87, hunger: 42, happiness: 37, health: 17, stars: 3, tags: ['drink', 'fruit'] },
    { id: 'seafoodPlatter', source: 'cooked', price: 98, hunger: 77, happiness: 35, health: 14, stars: 3, tags: ['seafood'], effects: [{ kind: 'slowHunger', percent: 30, hours: 8 }] },
    // A pick-me-up: lots of energy, so the pet can fish and play longer.
    // `limited` food isn't in the Shop every day (see `economy.limited`),
    // and Percy sometimes leaves one after a gold-frame order.
    { id: 'energyDrink', source: 'shop', price: 35, hunger: 0, happiness: 4, health: -2, energy: 40, limited: true, tags: ['drink'] },
    // Found on journeys, one kind per place. There are no seeds for these.
    { id: 'honey', source: 'found', price: 15, hunger: 8, happiness: 8, health: 2, stars: 1, tags: ['sweet'] },
    { id: 'wildMushroom', source: 'found', price: 15, hunger: 10, happiness: 0, health: 6, stars: 1, tags: ['veg'] },
    { id: 'seaweed', source: 'found', price: 20, hunger: 2, happiness: 4, health: 6, stars: 2, tags: ['seasoning'] },
    { id: 'stardustSugar', source: 'found', price: 25, hunger: 4, happiness: 14, health: 0, stars: 2, tags: ['sweet'] },
    // Dishes made with what journeys bring home.
    { id: 'honeyCake', source: 'cooked', price: 49, hunger: 34, happiness: 30, health: 5, stars: 2, tags: ['sweet'], effects: [{ kind: 'placeFind', place: 'market' }] },
    { id: 'mushroomSoup', source: 'cooked', price: 52, hunger: 40, happiness: 7, health: 15, stars: 2, tags: ['soup', 'veg'], effects: [{ kind: 'slowHunger', percent: 15, hours: 4 }, { kind: 'placeFind', place: 'woods' }] },
    { id: 'seaweedSalmon', source: 'cooked', price: 50, hunger: 30, happiness: 11, health: 11, stars: 2, tags: ['seafood'], effects: [{ kind: 'placeFind', place: 'cove' }] },
    { id: 'stardustPudding', source: 'cooked', price: 66, hunger: 30, happiness: 33, health: 6, stars: 3, tags: ['sweet'], effects: [{ kind: 'placeFind', place: 'hill' }] },
    // More dishes: second uses for what journeys bring home, the mixes
    // people try first, and the Bento, made partly from other dishes.
    { id: 'honeyMilk', source: 'cooked', price: 34, hunger: 18, happiness: 15, health: 8, stars: 1, tags: ['drink', 'sweet'] },
    { id: 'jamCookie', source: 'cooked', price: 23, hunger: 16, happiness: 22, health: 2, stars: 1, tags: ['sweet', 'fruit'] },
    { id: 'mushroomOnigiri', source: 'cooked', price: 23, hunger: 30, happiness: 2, health: 7, stars: 1, tags: ['veg', 'grain'] },
    { id: 'honeySalmon', source: 'cooked', price: 44, hunger: 32, happiness: 18, health: 9, stars: 2, tags: ['seafood', 'sweet'] },
    { id: 'starCookies', source: 'cooked', price: 41, hunger: 12, happiness: 30, health: 1, stars: 2, tags: ['sweet'] },
    { id: 'fruitPunch', source: 'cooked', price: 63, hunger: 24, happiness: 34, health: 10, stars: 3, tags: ['drink', 'fruit'] },
    { id: 'seaweedLobster', source: 'cooked', price: 75, hunger: 40, happiness: 20, health: 14, stars: 3, tags: ['seafood'], effects: [{ kind: 'steadyPaws', percent: 20, hours: 2 }] },
    { id: 'lobsterFriedRice', source: 'cooked', price: 74, hunger: 70, happiness: 20, health: 15, stars: 3, tags: ['seafood', 'grain', 'veg'] },
    { id: 'bento', source: 'cooked', price: 71, hunger: 80, happiness: 22, health: 18, stars: 3, tags: ['grain', 'seafood', 'veg'] },
    // What you get when the pot holds a mix that isn't a recipe.
    // Big-pot dishes: four ingredients, so they need the bigger pot.
    { id: 'seafoodChowder', source: 'cooked', price: 127, hunger: 85, happiness: 45, health: 33, stars: 3, tags: ['soup', 'seafood'] },
    { id: 'forestPotPie', source: 'cooked', price: 88, hunger: 70, happiness: 20, health: 25, stars: 2, tags: ['veg'] },
    { id: 'rainbowParfait', source: 'cooked', price: 119, hunger: 50, happiness: 60, health: 25, stars: 3, tags: ['sweet', 'fruit'] },
    { id: 'mushyMess', source: 'cooked', price: 1, hunger: 8, happiness: 0, health: 0, tags: [] },
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

  // Poop and bath time (see src/game/hygiene.ts). Now and then the pet
  // poops (tap a poop to pick it up) or gets smelly (tap the pet for a
  // bath: rub it with the sponge, then dry it). Little ones need it more
  // often. Each gap is the number of hours below, give or take a quarter,
  // and only counts while the pet is awake.
  hygiene: {
    poopEveryHours: { baby: 4, teen: 6, adult: 10 },
    smellyEveryHours: { baby: 10, teen: 14, adult: 20 },
    maxPoops: 3, // at most this many lying around at once
    poopSmellsAfterHours: 3, // a poop left this long makes the pet smelly too
    // Smelly for this long (awake), the pet is "stinky": its joy drops a
    // bit faster, and every hour it may catch germs, which count like a low
    // bar (a warning, then sick). A bath washes the germs off.
    stinkyAfterHours: 3,
    stinkyJoyPerHour: 2,
    germChancePerHour: 0.08,
    bathJoy: 8, // joy from a bath, once it's dry
    // The bath: how much rubbing (in room pixels moved over the pet) gets
    // it clean, and how long the dryer takes while held over it (moving
    // it about dries a little faster).
    rubNeeded: 360,
    dryMs: 2400,
    // Stopping the bath before it's dry: the pet smells again this soon.
    smellsAgainMs: 5000,
  },

  // The fishing mini-game (in the Play panel). Cast, wait for a bite, tap
  // Reel in, then hold Pull to keep the dot on the green stripe until the
  // catch meter fills (see src/game/fishing.ts).
  fishing: {
    energyPerCast: 3, // each cast tires the pet a little
    biteAfterSeconds: { min: 4, max: 10 }, // how long until a fish bites
    biteWindowSeconds: 1.6, // how long you have to tap Reel in after a bite
    // Before the real bite a fish may nibble at the bait up to `max` times,
    // each a quick little dip of `seconds`. Reeling in on a nibble scares
    // it off, so the wait is something to watch, not just sit through.
    nibbles: { max: 2, seconds: 0.4 },
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
      // Meter gained per second on each zone: green fills it fastest, so
      // you can see how well you're doing while you reel.
      fill: { perfect: 0.2, good: 0.12, weak: 0.06 },
      drain: 0.15, // meter lost per second on blue
      // A landed catch is perfect if at least this share of the time on
      // the coloured zones was on green, good if on green or yellow.
      gradeShare: 0.5,
    },
    // Everything about each fish you can catch (each is also a food above,
    // with source 'caught'). To add a fish: an entry here, its food, its
    // odds in each bait below, its icon and its line in STRINGS.fishing.hold.
    //  - `odds`: how likely it is to bite without bait, in percent.
    //  - `shadow`: how big it looks swimming up to the bait.
    //  - `rare`: the fish that Lucky line and a perfect streak make likelier
    //    (taken from whichever fish is likeliest). Only one should be rare.
    //  - `fight`: how it fights, as multiples of the reel numbers above.
    //    `shiftEvery` < 1 slides the zones more often, `shiftBy` > 1
    //    further, `glide` > 1 more slowly, and `drain` > 1 empties the
    //    meter faster. `tug` is how hard it yanks the dot back left now and
    //    then (every `tugEverySeconds`), as a kick to its speed.
    fish: {
      shrimp: { odds: 55, shadow: 'small', rare: false, fight: { shiftEvery: 1, shiftBy: 1, glide: 1, drain: 1, tug: 0 } },
      salmon: { odds: 33, shadow: 'medium', rare: false, fight: { shiftEvery: 0.5, shiftBy: 1.3, glide: 0.55, drain: 1, tug: 0 } },
      lobster: { odds: 12, shadow: 'big', rare: true, fight: { shiftEvery: 1, shiftBy: 1, glide: 1, drain: 1.3, tug: 0.85 } },
    },
    tugEverySeconds: { min: 1, max: 1.8 },
    // Each perfect catch in a row makes the rare fish this many percent
    // likelier on the next bite, for up to `max` in a row.
    streakBonus: { percent: 4, max: 3 },
    // How many fish one successful catch gives. A food buff could raise this
    // later on (e.g. a chance of an extra fish).
    fishPerCatch: 1,
    // The first this many fish landed each day (however many pets take a
    // turn) give Keeper XP and a chance of a seed. After that the fish are
    // shy: you can keep fishing for food, but without XP or seeds. One pet
    // lands about 15 a day, so only swapping in rested pets reaches it.
    rewardedPerDay: 30,
    // The tackle shelf in the Shop: baits for the pond. Pick one in the
    // pond (the little chip in its corner); each fish you land with it
    // uses one up. `odds` replace each fish's own odds while it's on, and `bitesSooner`
    // makes fish bite in that share of the usual time. None of them give
    // energy: that's the energy drink's job.
    baits: {
      crumbs: { price: 4, bitesSooner: 0.5 },
      bait: { price: 12, odds: { shrimp: 30, salmon: 45, lobster: 25 } },
      glowLure: { price: 25, odds: { shrimp: 15, salmon: 30, lobster: 55 } },
    },
  },

  // The rice jar: free rice balls, up to `size` in the pantry. While you
  // have fewer, one more appears every `refillHours`. Rice bought in the
  // Shop goes on top and doesn't count against the jar.
  // A bigger jar, bought once in the Shop for `bigger.fragments` star
  // fragments, holds `bigger.extra` more.
  riceJar: { size: 3, refillHours: 4, bigger: { fragments: 100, extra: 1 } },
  // A pet whose tummy is above this won't eat anything.
  tooFullAbove: 90,

  // Cooking (the last row of the Feed panel). Put up to `slots` foods from
  // your inventory in the pot and tap Cook. If they match a recipe (in any
  // order) you get that dish, and the recipe shows up in the recipe book;
  // any other mix makes a Mushy mess. Each recipe's id is the dish it makes
  // (a food above). Every food used in a recipe can go in the pot, a cooked
  // dish too, and the pot's pantry shows them in the order of `foods`.
  // A recipe can also say where it's made (`station`, the pot if not
  // given), how many it makes (`makes`, 1 if not given), and a seasonal
  // window it's open in (`unlock: { from: 'MM-DD', to: 'MM-DD' }`). See
  // src/game/cooking.ts.
  cooking: {
    slots: 3,
    // What a dish is worth: its ingredients' prices added up, times this
    // by how many go in (rounded), shared out over the `makes` it makes.
    // A `prep` station (cutting, milling) adds no worth: what it makes is
    // worth just its ingredients, so it never makes gold by itself.
    worth: { 1: 1.25, 2: 1.25, 3: 1.4, 4: 1.55 },
    // Where recipes are made. Every kitchen has the pot and the cutting
    // board (`starter`); the rest need the kitchen item of the same name.
    // A `timed` station takes a while and keeps going while the game is
    // closed (not built yet).
    stations: {
      pot: { starter: true },
      board: { prep: true, starter: true },
      oven: {},
      mill: { prep: true, timed: true },
    },
    // Things you can buy for the kitchen (kept in `state.kitchen`), in
    // the Shop's Food tab for `price` gold. No price: not sold yet.
    //  - `biggerPot`: the pot takes `slots` foods, which opens the
    //    four-ingredient recipes.
    //  - `doubleBatch`: a ×2 switch on the pot that cooks two of a dish at
    //    once from two of everything. It saves taps, not food.
    kitchen: {
      biggerPot: { slots: 4, price: 400 },
      doubleBatch: { price: 300 },
      oven: {},
      mill: {},
    },
    // The cutting board's timing game: a marker runs along a meter on the
    // counter and back every `sweepSeconds`, and each tap chops the
    // fish on the next of its `chops` dotted lines. A chop while the
    // marker is inside `band` (shares of the way along) is a perfect one;
    // all of them perfect is a perfect cut, worth `perfectXp` Keeper XP.
    // Any cut still makes the fillet.
    cutting: { sweepSeconds: 1.2, band: { start: 0.42, end: 0.58 }, chops: 3, perfectXp: 2 },
    recipes: [
      { id: 'grilledShrimp', ingredients: ['shrimp'] },
      { id: 'shrimpOnigiri', ingredients: ['riceBall', 'shrimp'] },
      { id: 'strawberryMilk', ingredients: ['strawberry', 'warmMilk'] },
      { id: 'grilledSalmon', ingredients: ['salmon'] },
      { id: 'salmonSushi', ingredients: ['riceBall', 'salmonFillet'] },
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
      { id: 'seaweedSalmon', ingredients: ['seaweed', 'salmon'] },
      { id: 'stardustPudding', ingredients: ['stardustSugar', 'warmMilk', 'strawberry'] },
      { id: 'honeyMilk', ingredients: ['honey', 'warmMilk'] },
      { id: 'jamCookie', ingredients: ['strawberry', 'cookie'] },
      { id: 'mushroomOnigiri', ingredients: ['wildMushroom', 'riceBall'] },
      { id: 'honeySalmon', ingredients: ['honey', 'salmon'] },
      { id: 'starCookies', ingredients: ['stardustSugar', 'cookie'] },
      { id: 'fruitPunch', ingredients: ['strawberry', 'dragonFruit'] },
      { id: 'seaweedLobster', ingredients: ['seaweed', 'lobsterTail'] },
      { id: 'lobsterFriedRice', ingredients: ['lobster', 'riceBall', 'carrot'] },
      // Made from two other dishes and a carrot.
      { id: 'bento', ingredients: ['shrimpOnigiri', 'grilledSalmon', 'carrot'] },
      // Cut on the cutting board (a short timing game; see `cutting`).
      { id: 'salmonFillet', ingredients: ['salmon'], station: 'board' },
      { id: 'lobsterTail', ingredients: ['lobster'], station: 'board' },
      // Four ingredients: these need the bigger pot.
      { id: 'seafoodChowder', ingredients: ['shrimp', 'salmon', 'lobster', 'warmMilk'] },
      { id: 'forestPotPie', ingredients: ['carrot', 'pumpkin', 'wildMushroom', 'warmMilk'] },
      { id: 'rainbowParfait', ingredients: ['strawberry', 'dragonFruit', 'honey', 'warmMilk'] },
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
    // Poop you pick up is kept, and this many make one bag of fertilizer
    // (in the Shop's garden tab, or straight from Fertilize when you're
    // out of bags). It's the same fertilizer the Shop sells.
    poopPerFertilizer: 3,
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
    // After a mingle the pair waits `waitDays` before the next one, so a
    // little one is a big moment rather than a steady stream.
    mingle: {
      minScore: 70,
      chance: [
        { minScore: 100, chance: 80 },
        { minScore: 85, chance: 65 },
        { minScore: 70, chance: 50 },
      ],
      waitDays: 7,
    },
    // How many pets fit in a room (the main room, and the Family Home once
    // you have it). A little one that arrives when they're full waits in
    // the nest until you make room (nobody has to leave).
    maxPets: 2,
    // Wanderers lean towards common characters (percent by stars), so
    // friends' pets stay the best route to rare little ones.
    wandererStars: { 1: 65, 2: 25, 3: 10 },
    // This share (percent) of wanderers is a character you haven't met or
    // raised yet (of the rarity rolled), while there's one left to meet.
    unmetWandererChance: 60,
  },

  // What a little one grows into (see src/game/growth.ts). It takes after
  // one of its parents' themes ("climbing the family"):
  // - It only grows into a 3-star character if a parent shows that theme
  //   as a 2-star or 3-star character. Otherwise it stops at 2 stars.
  // - With a 1-star parent, it's a 1-star at least `oneStarFloor` percent
  //   of the time, whatever the Care Score (the rest come off 3 stars,
  //   then 2).
  // - `outsideThemeChance` percent of the time it grows into a theme a
  //   parent only carries (see `genes`), if they carry one, never a theme
  //   from nowhere.
  inheritance: {
    oneStarFloor: 35,
    outsideThemeChance: 10,
  },

  // Genes (see src/game/genes.ts). A carried theme can come back now and
  // then (`inheritance.outsideThemeChance`). A colour variant a parent
  // shows or carries comes back this share of the time, when the little
  // one grows into that character (otherwise the variant's usual chance
  // applies). A first pet or a wanderer carries a colour variant this
  // share of the time.
  genes: {
    variantChance: 20,
    wildVariantChance: 10,
  },

  // The fortune cookie (see src/game/fortune.ts), sold in the Shop and
  // opened before mingling for a hint about the little one. A second theme
  // only gets a mention ("…and maybe a sweet surprise") if its chance is at
  // least `surpriseFrom` percent.
  fortune: {
    price: 20,
    surpriseFrom: 8,
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
    // After `afterTrips` finished journeys, a pet picks a favourite place
    // (where it has been most, its own theme breaking a tie). It finds
    // `extraFinds` more there, and its ticket shows a heart.
    favourite: { afterTrips: 3, extraFinds: 1 },
    // How often a postcard's story is about something the pet loves or
    // dislikes, when the trip gives it one (see storyOf in journeys.ts).
    storyLikeChance: 0.6,
    // A place's page in the travel journal goes up a level at these many
    // finished trips there: Visitor, Regular, Local and Legend.
    levels: [1, 5, 15, 40],
    // An Adventure (or a night trip of epic rarity) makes a friend there
    // `chance` of the time: a pet of the place's theme with these star odds
    // (percent), who joins your friends at `score` once the backpack's open.
    friend: { chance: 0.2, stars: { 1: 20, 2: 60, 3: 20 }, score: 10 },
    // The night ticket: from `fromHour` in the evening to the morning
    // (`CONFIG.sleep.wakeHour`), one extra ticket that lasts `hours`, so
    // there's always a trip for the night.
    // Its finds are rare or epic by `odds` (percent); it uses what an
    // Adventure uses. Not taken by morning, it's gone until the next night.
    night: { fromHour: 20, hours: 10, odds: { rare: 75, epic: 25 } },
    // A Holiday in the Meadow, for a ticket from the Star Shop
    // (`fragments` star fragments): every pet goes for one of `days`, and
    // everything waits while they're away. Hunger, energy and health stay
    // as they were, the garden stops, growing up pauses, nothing is found
    // and no good care days are counted. They come home `joy` happier.
    holiday: { fragments: 50, days: [1, 2, 3], joy: 10 },
    // Snapshots (see snapshots.ts): each look at a trip has `chance` of a
    // little moment after a few seconds, and another try every `againMs`
    // while you keep looking; a moment lasts `momentMs`. `freshShare` of the
    // time it's one that isn't in the journal yet (if there are any).
    snapshots: { chance: 0.6, freshShare: 0.7, firstMs: [4000, 9000], againMs: 45000, momentMs: 7000 },
    // The places, one per theme. Each opens with `opens` (see journeys.ts)
    // and has finds by stars: a food, a seed ("seed:pumpkin") or gold
    // ("gold:12").
    places: [
      {
        id: 'market', theme: 'bakery', ingredient: 'honey', opens: 'start',
        finds: {
          1: ['strawberry', 'warmMilk', 'cookie', 'gold:10', 'seed:carrot'],
          2: ['gold:25', 'jamCookie', 'berryShortcake', 'seed:pumpkin'],
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
        id: 'cove', theme: 'ocean', ingredient: 'seaweed', opens: 'fish',
        finds: {
          1: ['shrimp', 'gold:12'],
          2: ['salmon', 'gold:30'],
          3: ['lobster', 'gold:70'],
        },
      },
      {
        id: 'hill', theme: 'starry', ingredient: 'stardustSugar', opens: 'grownUp',
        finds: {
          1: ['warmMilk', 'cookie', 'gold:12'],
          2: ['honeyMilk', 'starCookies', 'gold:30', 'seed:pumpkin'],
          3: ['stardustPudding', 'seed:dragonFruit', 'gold:80'],
        },
      },
    ],
    // `opens: 'fish'` needs this many fish landed.
    fishToOpen: 10,
  },

  // Sniff and dig (Play > Dig, see dig.ts): a little treasure hunt each
  // day at four spots, the Meadow and three of the journey places. Every
  // spot is a `size` x `size` patch with `treasures` buried in it (one more
  // at a 3-star spot), and you get `digsPerDay` digs a day to share between
  // them. A dug hole shows how many treasures are buried next to it. Each
  // spot has `sniffs` (the hill one more, and one more where a pet at home
  // loves the place): the pet points its nose at a buried treasure. It costs
  // no energy, and never gives energy or star fragments.
  //
  // A spot has 1 or 2 stars (`twoStarChance`), and one spot a day can be a
  // rare 3-star one (`rareChance`) with a 3-star find and the place's
  // ingredient in it; elsewhere the ingredient turns up `ingredientChance`
  // of the time. Treasures left in the ground stay buried there for the
  // next day the place comes up (at most `keepLeftovers`).
  //
  // The woods have `roots` you can't dig through. At the cove the tide
  // comes in from a different side each day and covers one more row or
  // column every `tideEvery` digs there (at most `tideLines`). The market
  // has `marketGold` more treasure, always gold.
  dig: {
    size: 6,
    digsPerDay: 6,
    treasures: 4,
    sniffs: 1,
    spots: 4,
    twoStarChance: 0.4,
    rareChance: 0.3,
    ingredientChance: 0.3,
    keepLeftovers: 2,
    roots: 5,
    tideEvery: 2,
    tideLines: 2,
    marketGold: 1,
    // What can be buried at each place, by stars (written like the journey
    // finds). No energy drinks: digging is never a way to skip a nap.
    finds: {
      meadow: {
        1: ['strawberry', 'carrot', 'seed:carrot', 'gold:8'],
        2: ['honey', 'seed:pumpkin', 'gold:20'],
        3: ['seed:dragonFruit', 'gold:50'],
      },
      market: {
        1: ['strawberry', 'cookie', 'gold:10', 'seed:carrot'],
        2: ['gold:25', 'jamCookie', 'seed:pumpkin'],
        3: ['gold:60', 'seed:dragonFruit', 'berryShortcake'],
      },
      woods: {
        1: ['strawberry', 'carrot', 'seed:carrot', 'gold:8'],
        2: ['pumpkin', 'seed:pumpkin', 'gold:20'],
        3: ['dragonFruit', 'seed:dragonFruit'],
      },
      cove: {
        1: ['shrimp', 'gold:12'],
        2: ['salmon', 'gold:30'],
        3: ['lobster', 'gold:70'],
      },
      hill: {
        1: ['warmMilk', 'cookie', 'gold:12'],
        2: ['starCookies', 'gold:30', 'seed:pumpkin'],
        3: ['stardustPudding', 'seed:dragonFruit', 'gold:80'],
      },
    },
  },

  // Decorating the room, from the Shop: a wallpaper, window curtains and
  // furniture. Each is bought once, then you pick which to use in each
  // room. Every room starts with the plain wallpaper, no curtains and no
  // furniture.
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
    // Furniture: bought once, then placed in any room. A room has five
    // spots: two on the wall (`wall` to the right, the smaller `wallMid`
    // beside the window), the windowsill (`sill`) and the floor at the
    // left and right side. Each spot holds one piece. `spots` lists where a
    // piece fits, its usual spot first (where it goes when bought). How
    // each looks lives in src/render/furniture.ts. Only for looks.
    furniture: [
      { id: 'garland', spots: ['wall'], price: 100 },
      { id: 'portrait', spots: ['wall', 'wallMid'], price: 120 },
      { id: 'shelf', spots: ['wall'], price: 160 },
      { id: 'cactus', spots: ['sill'], price: 60 },
      { id: 'candle', spots: ['sill'], price: 70 },
      { id: 'plant', spots: ['left', 'right'], price: 120 },
      { id: 'lamp', spots: ['left', 'right'], price: 180 },
      { id: 'toyBox', spots: ['right', 'left'], price: 140 },
      { id: 'bookshelf', spots: ['right', 'left'], price: 220 },
    ],
  },

  // The Shop's daily special: one thing you don't own yet (furniture, a
  // wallpaper, curtains or a gold hat), picked for each day, at `off`
  // less (0.25 = a quarter off, rounded to 5 gold).
  dailySpecial: { off: 0.25 },

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
    journeys: [1, 25, 100], // journeys finished (not called home early)
    epicFinds: [1, 5, 15], // 3-star finds brought home from journeys (Percy's included)
    adventures: [1, 10, 30], // 10-hour Adventures finished
  },

  // Skills (in the menu, see src/game/skills.ts). Doing things earns Keeper
  // XP, each Keeper level gives a skill point, and points are spent on
  // skills. They belong to you, not the pet, so they carry over to every
  // pet you raise.
  skills: {
    // XP for each thing counted for an achievement (per one).
    xp: { fish: 3, deliveries: 5, harvests: 4, dishes: 3, cravings: 5, gifts: 2, littleOnes: 20, journeys: 8, epicFinds: 15, adventures: 10 },
    perfectFishXp: 2, // extra for a perfect catch (5 in all)
    deliveryXp: { bronze: 0, silver: 5, gold: 15 }, // extra for a fuller order (5 / 10 / 20 in all)
    grownUpXp: { 1: 20, 2: 40, 3: 80 }, // a pet growing up, by its stars
    badgeXp: { bronze: 25, silver: 50, gold: 100 },
    milestoneXp: 50, // a Milestone badge (see src/game/milestones.ts)
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
      luckyLine: 5, // the rare fish (lobster) 5% likelier
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
    startingFood: { riceBall: 3, strawberry: 2, cookie: 1 },
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
