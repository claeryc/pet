extends SceneTree
## Checks the game rules (scripts/rules.gd) with no window. Run with:
##   godot --headless --path godot-prototype -s res://tests/test_rules.gd
## It prints each check and quits with code 1 if any failed.

const T: Tuning = preload("res://data/tuning.tres")
var OPTIONS: Array = [
	preload("res://data/care/rice_ball.tres"),
	preload("res://data/care/strawberry.tres"),
	preload("res://data/care/cookie.tres"),
	preload("res://data/care/cuddle.tres"),
	preload("res://data/care/tickle.tres"),
]
var failed := 0
var passed := 0


func check(what: String, ok: bool) -> void:
	if ok:
		passed += 1
	else:
		failed += 1
		print("FAIL  ", what)


func opt(id: String) -> CareOption:
	for o: CareOption in OPTIONS:
		if o.id == id:
			return o
	return null


func fresh() -> Dictionary:
	return PetRules.new_state(T, OPTIONS, "sprig", 1_000_000.0)


func noon(_unix: float) -> int:
	return 12


func midnight(_unix: float) -> int:
	return 0


func _init() -> void:
	# A new pet starts with the tuning's stats and food.
	var s := fresh()
	check("starts with 80 tummy", s.stats.hunger == 80.0)
	check("starts with 3 rice balls", s.inventory.riceBall == 3)

	# Ten hours in the day: an adult loses 4 x 0.9 tummy an hour.
	s = fresh()
	PetRules.simulate(s, T, s.last_update + 10 * 3600, noon)
	check("tummy after 10 hours is 44 (got %.2f)" % s.stats.hunger, is_equal_approx(snappedf(s.stats.hunger, 0.01), 44.0))
	check("joy after 10 hours is 53 (got %.2f)" % s.stats.happiness, is_equal_approx(snappedf(s.stats.happiness, 0.01), 53.0))

	# Staying up at night is twice as tiring.
	var day := fresh()
	var night := fresh()
	PetRules.simulate(day, T, day.last_update + 3600, noon)
	PetRules.simulate(night, T, night.last_update + 3600, midnight)
	check("night costs twice the energy", is_equal_approx(80.0 - night.stats.energy, 2.0 * (80.0 - day.stats.energy)))

	# Asleep: energy comes back, hunger drops at half speed.
	s = fresh()
	s.asleep = true
	PetRules.simulate(s, T, s.last_update + 2 * 3600, midnight)
	check("sleeping restores energy (got %.1f)" % s.stats.energy, s.stats.energy > 100.0 - 0.01)
	check("sleeping halves hunger loss", is_equal_approx(snappedf(s.stats.hunger, 0.01), 80.0 - 2 * 4 * 0.9 * 0.5))

	# Wakes up by itself in the morning.
	s = fresh()
	s.asleep = true
	PetRules.step(s, T, 1.0 / 60.0, T.wake_hour)
	check("wakes up at wake hour", not s.asleep)

	# Stats never leave 0-100, even after a week away.
	s = fresh()
	PetRules.simulate(s, T, s.last_update + 30 * 24 * 3600, noon)
	for k in PetRules.STATS:
		check("%s stays in 0-100" % k, s.stats[k] >= 0.0 and s.stats[k] <= 100.0)
	check("a neglected pet looks sick", PetRules.look(s, T) == &"sick")

	# Feeding uses up the food and adds its stats.
	s = fresh()
	var gains := PetRules.apply(s, opt("cookie"))
	check("cookie gains", gains == {"hunger": 6, "happiness": 12, "health": -2})
	check("cookie used up", s.inventory.cookie == 0)
	check("no second cookie", PetRules.blocked(s, opt("cookie")) == "none_left")
	check("refused care changes nothing", PetRules.apply(s, opt("cookie")).is_empty())

	# Full stats cap the gain shown.
	s = fresh()
	s.stats.happiness = 95.0
	check("joy gain capped at 5", PetRules.apply(s, opt("cuddle")).get("happiness") == 5)

	# A sleeping pet can't eat or play; a tired one can't play.
	s = fresh()
	s.asleep = true
	check("asleep blocks food", PetRules.blocked(s, opt("riceBall")) == "asleep")
	s = fresh()
	s.stats.energy = 3.0
	check("too tired to tickle", PetRules.blocked(s, opt("tickle")) == "too_tired")

	# Looks and faces.
	s = fresh()
	check("80 joy looks cheerful", PetRules.look(s, T) == &"cheerful")
	s.stats.hunger = 20.0
	check("hungry pet looks sad", PetRules.look(s, T) == &"sad")
	check("hungry pet pulls a hungry face", PetRules.mood_face(s, T, 0) == &"hungry")
	s = fresh()
	check("pouts when ignored", PetRules.mood_face(s, T, 999) == &"pouting")

	# The rice jar refills the next day, other food doesn't.
	s = fresh()
	s.inventory.riceBall = 0
	s.inventory.cookie = 0
	PetRules.refill(s, OPTIONS, s.last_update + 86400)
	check("rice jar refills", s.inventory.riceBall == 3)
	check("cookies don't", s.inventory.cookie == 0)

	print("%d passed, %d failed" % [passed, failed])
	quit(1 if failed else 0)
