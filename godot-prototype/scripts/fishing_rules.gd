class_name FishingRules
extends RefCounted
## The rules of the fishing mini-game, with no screen attached (a port of
## src/game/fishing.ts). A bite brings up a bar with a green stripe, yellow
## on both sides, red beyond and blue elsewhere. Holding Pull drags the dot
## right, letting go lets it drift left, and the stripe slides now and then.
## On a coloured zone the catch meter fills (green fastest), on blue it
## drains. Full: landed, graded by where the dot spent its time. Empty: the
## fish swims off. `random` arguments are numbers from 0 to 1.


static func _reaches(t: FishingTuning, widen := 1.0) -> Dictionary:
	var perfect := t.zone_perfect * widen / 2.0
	var good := perfect + t.zone_good
	return {"perfect": perfect, "good": good, "weak": good + t.zone_weak}


## The zones around a centre spot, kept fully on the bar.
static func zones_around(t: FishingTuning, center: float, widen := 1.0) -> Dictionary:
	var r := _reaches(t, widen)
	var c := clampf(center, r.weak, 1.0 - r.weak)
	var out := {}
	for k in ["perfect", "good", "weak"]:
		out[k] = Vector2(c - r[k], c + r[k])
	return out


static func grade_at(zones: Dictionary, position: float) -> String:
	for k in ["perfect", "good", "weak"]:
		if position >= zones[k].x and position <= zones[k].y:
			return k
	return "miss"


static func _shift_gap(t: FishingTuning, random: float, fish: FishKind) -> float:
	return lerpf(t.shift_every_min, t.shift_every_max, random) * fish.shift_every


static func _tug_gap(t: FishingTuning, random: float) -> float:
	return lerpf(t.tug_every_min, t.tug_every_max, random)


## Where the zones slide to next: a bit left or right, bouncing off the ends.
static func next_center(t: FishingTuning, center: float, random: float, widen := 1.0, far := 1.0) -> float:
	var r := _reaches(t, widen)
	var left := random < 0.5
	var by := lerpf(t.shift_by_min, t.shift_by_max, (random if left else random - 0.5) * 2.0) * far
	var to := center + (-by if left else by)
	if to < r.weak or to > 1.0 - r.weak:
		to = center + (by if left else -by)
	return clampf(to, r.weak, 1.0 - r.weak)


## A fresh reel: the dot at the left end, the zones somewhere random.
static func start_reel(t: FishingTuning, random: float, fish: FishKind, widen := 1.0) -> Dictionary:
	var r := _reaches(t, widen)
	var center: float = r.weak + random * (1.0 - 2.0 * r.weak)
	return {
		"elapsed": 0.0, "marker": 0.0, "speed": 0.0,
		"center": center, "from": center, "to": center,
		"shifted_at": 0.0, "next_shift_at": _shift_gap(t, random, fish),
		"meter": t.meter_start, "widen": widen,
		"time_in": {"perfect": 0.0, "good": 0.0, "weak": 0.0, "miss": 0.0},
		"fish": fish, "next_tug_at": t.grace_seconds + _tug_gap(t, random),
	}


## Moves the reel on by `dt` seconds. `held`: Pull is held down.
static func step_reel(t: FishingTuning, reel: Dictionary, held: bool, dt: float, random: float) -> void:
	var fish: FishKind = reel.fish
	dt = minf(dt, 0.05) # a long hiccup counts as one short step
	reel.elapsed += dt
	var speed: float = reel.speed + (t.pull if held else -t.drift) * dt
	if fish.tug > 0 and reel.elapsed >= reel.next_tug_at:
		speed -= fish.tug
		reel.next_tug_at = reel.elapsed + _tug_gap(t, random)
	speed = clampf(speed, -t.max_speed - fish.tug, t.max_speed)
	var marker: float = reel.marker + speed * dt
	if marker <= 0.0 or marker >= 1.0:
		marker = clampf(marker, 0.0, 1.0)
		speed = 0.0
	reel.marker = marker
	reel.speed = speed
	if reel.elapsed >= reel.next_shift_at:
		reel.from = reel.center
		reel.to = next_center(t, reel.center, random, reel.widen, fish.shift_by)
		reel.shifted_at = reel.elapsed
		reel.next_shift_at = reel.elapsed + _shift_gap(t, random, fish)
	var glide := minf(1.0, (reel.elapsed - reel.shifted_at) / (t.glide_seconds * fish.glide))
	reel.center = lerpf(reel.from, reel.to, glide * glide * (3.0 - 2.0 * glide))
	var grade := grade_at(zones_around(t, reel.center, reel.widen), marker)
	var grace: bool = reel.elapsed <= t.grace_seconds
	var change := 0.0
	match grade:
		"perfect": change = t.fill_perfect
		"good": change = t.fill_good
		"weak": change = t.fill_weak
		_: change = 0.0 if grace else -t.drain * fish.drain
	reel.meter = clampf(reel.meter + change * dt, 0.0, 1.0)
	if not grace or grade == "perfect":
		reel.time_in[grade] += dt


## "landed" once the meter is full, "lost" once it's empty, else "".
static func outcome(reel: Dictionary) -> String:
	if reel.meter >= 1.0:
		return "landed"
	if reel.meter <= 0.0:
		return "lost"
	return ""


## How good a landed catch was: mostly green is perfect, mostly green and
## yellow is good.
static func grade(t: FishingTuning, reel: Dictionary) -> String:
	var ti: Dictionary = reel.time_in
	var total: float = ti.perfect + ti.good + ti.weak
	if total <= 0:
		return "miss"
	if ti.perfect / total >= t.grade_share:
		return "perfect"
	if (ti.perfect + ti.good) / total >= t.grade_share:
		return "good"
	return "weak"


static func bite_delay(t: FishingTuning, random: float) -> float:
	return lerpf(t.bite_after_min, t.bite_after_max, random)


## When the fake nibbles come (seconds after the cast), before a bite at
## `bite`: after the bait has sunk, and clear of the real bite.
static func nibble_times(t: FishingTuning, bite: float, count: float, spots: Array) -> Array:
	var from := 2.0
	var to := bite - 1.0 - t.nibble_seconds
	if to <= from:
		return []
	var n := mini(t.nibbles_max, int(floor(count * (t.nibbles_max + 1))))
	var gap := (to - from) / maxf(1, n)
	var out := []
	for i in n:
		out.append(from + gap * (i + (spots[i] if i < spots.size() else 0.5) * 0.8))
	return out


## Which fish bites, by their odds. Each perfect catch in a row (up to
## streak_max) moves streak_bonus percent from the likeliest fish to the
## rare one.
static func pick_fish(t: FishingTuning, random: float, streak := 0) -> FishKind:
	var odds := {}
	var total := 0.0
	for f in t.fish:
		odds[f] = float(f.odds)
	var bonus := float(mini(streak, t.streak_max) * t.streak_bonus)
	if bonus > 0:
		var rare: FishKind = null
		var common: FishKind = null
		for f in t.fish:
			if f.rare:
				rare = f
			elif common == null or f.odds > common.odds:
				common = f
		if rare and common:
			var moved := minf(bonus, odds[common])
			odds[common] -= moved
			odds[rare] += moved
	for f in odds:
		total += odds[f]
	var roll := random * total
	for f in t.fish:
		roll -= odds[f]
		if roll < 0:
			return f
	return t.fish[-1]


## Throws the line: costs a little energy. Returns why it can't, or "".
static func cast(state: Dictionary, t: FishingTuning) -> String:
	if state.asleep:
		return "asleep"
	if state.stats.energy < t.energy_per_cast:
		return "too_tired"
	state.stats.energy -= t.energy_per_cast
	return ""


## A landed fish goes into the pantry.
static func land(state: Dictionary, fish: FishKind) -> void:
	var id := fish.food.id
	state.inventory[id] = int(state.inventory.get(id, 0)) + 1
