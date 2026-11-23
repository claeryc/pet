class_name PetRules
extends RefCounted
## The rules of the game, with no screen attached: what time passing does to
## the stats, and what feeding and playing do. A port of the parts of
## src/game/stats.ts and src/game/actions.ts the home screen needs. Pure
## functions on a plain Dictionary, so tests/test_rules.gd can check them
## without opening a window.

const STATS := ["hunger", "happiness", "health", "energy"]


static func new_state(t: Tuning, options: Array, pet_id: String, now: float) -> Dictionary:
	var inventory := {}
	for o: CareOption in options:
		if o.kind == CareOption.Kind.FOOD:
			inventory[o.id] = o.starting_count
	return {
		"pet": pet_id,
		"stats": {"hunger": t.start_hunger, "happiness": t.start_happiness,
			"health": t.start_health, "energy": t.start_energy},
		"asleep": false,
		"gold": t.start_gold,
		"inventory": inventory,
		"last_update": now,
		"last_refill_day": day_of(now),
	}


## The local hour (0-23) at a unix time.
static func local_hour(unix: float) -> int:
	var bias: int = Time.get_time_zone_from_system().get("bias", 0)
	return Time.get_datetime_dict_from_unix_time(int(unix) + bias * 60).hour


static func day_of(unix: float) -> int:
	var bias: int = Time.get_time_zone_from_system().get("bias", 0)
	return int(floor((unix + bias * 60) / 86400.0))


static func is_night(t: Tuning, hour: int) -> bool:
	return hour >= t.bedtime_hour or hour < t.wake_hour


## Moves the pet forward from state.last_update to `now`, a minute at a time
## (like simulate() in the web game). `hour_of` can be swapped in tests.
static func simulate(state: Dictionary, t: Tuning, now: float, hour_of := Callable()) -> void:
	if hour_of.is_null():
		hour_of = local_hour
	var start: float = state.last_update
	var minutes := int(floor((now - start) / 60.0))
	minutes = mini(minutes, 7 * 24 * 60) # a week away is the most we catch up on
	for i in minutes:
		step(state, t, 1.0 / 60.0, hour_of.call(start + (i + 1) * 60.0))
	state.last_update = start + minutes * 60.0 if minutes < 7 * 24 * 60 else now


## One step of `hours` hours at local hour `hour`.
static func step(state: Dictionary, t: Tuning, hours: float, hour: int) -> void:
	var s: Dictionary = state.stats
	var mult := t.adult_decay_multiplier
	var night := is_night(t, hour)
	if state.asleep and hour == t.wake_hour:
		state.asleep = false # wakes up by itself in the morning
	if state.asleep:
		s.energy += t.energy_per_hour_asleep * hours
		s.hunger -= t.decay_hunger * mult * t.decay_multiplier_asleep * hours
		s.happiness -= t.decay_happiness * mult * t.decay_multiplier_asleep * hours
	else:
		var tired := t.energy_multiplier_night_awake if night else 1.0
		s.energy -= t.decay_energy * mult * tired * hours
		s.hunger -= t.decay_hunger * mult * hours
		s.happiness -= t.decay_happiness * mult * hours
	s.health -= t.decay_health * hours
	if is_neglected(state, t):
		s.health -= t.neglect_decay_per_hour * hours
	elif s.hunger >= t.good_stat and s.happiness >= t.good_stat:
		s.health += t.recover_per_hour_when_cared * hours
	clamp_stats(state)


static func clamp_stats(state: Dictionary) -> void:
	for k in STATS:
		state.stats[k] = clampf(state.stats[k], 0.0, 100.0)


static func is_neglected(state: Dictionary, t: Tuning) -> bool:
	for k in ["hunger", "happiness", "energy"]:
		if state.stats[k] < t.low_stat:
			return true
	return false


## Which body animation fits the pet right now (getLook in the web game).
static func look(state: Dictionary, t: Tuning) -> StringName:
	if state.asleep:
		return &"sleep"
	if state.stats.health < t.sick_below:
		return &"sick"
	if is_neglected(state, t):
		return &"sad"
	if state.stats.happiness >= t.cheerful_happiness:
		return &"cheerful"
	return &"idle"


## The face that fits the pet's mood, with no reaction playing.
static func mood_face(state: Dictionary, t: Tuning, idle_seconds: float) -> StringName:
	var s: Dictionary = state.stats
	if state.asleep:
		return &"sleepy"
	if s.health < t.sick_below:
		return &"sick"
	if s.happiness < t.crying_below:
		return &"crying"
	if s.happiness < t.low_stat:
		return &"sad"
	if s.hunger < t.low_stat:
		return &"hungry"
	if s.energy < t.sleepy_below:
		return &"sleepy"
	if idle_seconds >= t.pout_after_seconds:
		return &"pouting"
	return &"content"


## Why an option can't be used right now, or "" if it can.
static func blocked(state: Dictionary, option: CareOption) -> String:
	if state.asleep:
		return "asleep"
	if option.kind == CareOption.Kind.FOOD and int(state.inventory.get(option.id, 0)) <= 0:
		return "none_left"
	if option.kind == CareOption.Kind.PLAY and state.stats.energy + option.energy < 0:
		return "too_tired"
	return ""


## Feeds or plays. Returns the change to each stat (what the +10 bubbles
## show), or an empty Dictionary if it couldn't be done.
static func apply(state: Dictionary, option: CareOption) -> Dictionary:
	if blocked(state, option) != "":
		return {}
	if option.kind == CareOption.Kind.FOOD:
		state.inventory[option.id] = int(state.inventory[option.id]) - 1
	var before: Dictionary = state.stats.duplicate()
	for k in option.effects():
		state.stats[k] += option.effects()[k]
	clamp_stats(state)
	var gains := {}
	for k in STATS:
		var d := roundi(state.stats[k] - before[k])
		if d != 0:
			gains[k] = d
	return gains


## The rice jar: foods that refill do so once a day.
static func refill(state: Dictionary, options: Array, now: float) -> void:
	var today := day_of(now)
	if today == state.get("last_refill_day", today):
		return
	state.last_refill_day = today
	for o: CareOption in options:
		if o.refills_daily:
			state.inventory[o.id] = maxi(int(state.inventory.get(o.id, 0)), o.starting_count)
