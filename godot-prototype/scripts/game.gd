extends Node
## The running game (an autoload, so every scene can reach it as `Game`):
## holds the pet's state, moves time on, saves and loads, and tells the
## screen when something changed. The rules themselves are in rules.gd.

signal changed
## A food was eaten or a way to play was done. `gains` is the change to
## each stat, e.g. {"hunger": 15}.
signal cared(option: CareOption, gains: Dictionary)
signal refused(option: CareOption, reason: String)

const SAVE_PATH := "user://pet.json"
const TUNING: Tuning = preload("res://data/tuning.tres")
const FISHING: FishingTuning = preload("res://data/fishing.tres")
const OPTIONS: Array[CareOption] = [
	preload("res://data/care/rice_ball.tres"),
	preload("res://data/care/strawberry.tres"),
	preload("res://data/care/cookie.tres"),
	preload("res://data/care/shrimp.tres"),
	preload("res://data/care/salmon.tres"),
	preload("res://data/care/lobster.tres"),
	preload("res://data/care/cuddle.tres"),
	preload("res://data/care/tickle.tres"),
]
const PETS: Array[PetLook] = [
	preload("res://pets/sprig.tres"),
	preload("res://pets/dumpling.tres"),
	preload("res://pets/acornet.tres"),
	preload("res://pets/pinchy.tres"),
	preload("res://pets/starhoot.tres"),
]
const PET_IDS := ["sprig", "dumpling", "acornet", "pinchy", "starhoot"]
## Testing: how fast game time runs (1 = real time).
const SPEEDS := [1, 60, 600]

var state: Dictionary
var speed := 1
## Seconds the game clock is ahead of the real one (from running faster).
var clock_ahead := 0.0
## When the player last did anything with the pet (for pouting).
var last_care_at := 0.0
var _since_tick := 0.0


func _ready() -> void:
	state = _load()
	PetRules.simulate(state, TUNING, now())
	PetRules.refill(state, OPTIONS, now())
	last_care_at = now()


func now() -> float:
	return Time.get_unix_time_from_system() + clock_ahead


func _process(delta: float) -> void:
	clock_ahead += delta * (speed - 1)
	_since_tick += delta
	if _since_tick >= 1.0:
		_since_tick = 0.0
		tick()


## Catches the pet up with the clock.
func tick() -> void:
	PetRules.simulate(state, TUNING, now())
	PetRules.refill(state, OPTIONS, now())
	changed.emit()


func look() -> PetLook:
	var i := PET_IDS.find(state.pet)
	return PETS[maxi(i, 0)]


func pet_name() -> String:
	return look().display_name


func is_night() -> bool:
	return PetRules.is_night(TUNING, PetRules.local_hour(now()))


func idle_seconds() -> float:
	return (now() - last_care_at) / speed if speed > 1 else now() - last_care_at


func options(kind: CareOption.Kind) -> Array[CareOption]:
	return OPTIONS.filter(func(o: CareOption) -> bool: return o.kind == kind)


func count(option: CareOption) -> int:
	return int(state.inventory.get(option.id, 0))


func care(option: CareOption) -> void:
	tick()
	var why := PetRules.blocked(state, option)
	if why != "":
		refused.emit(option, why)
		return
	var gains := PetRules.apply(state, option)
	last_care_at = now()
	save()
	cared.emit(option, gains)
	changed.emit()


## Throws the fishing line. Returns why it can't, or "".
func cast() -> String:
	tick()
	var why := FishingRules.cast(state, FISHING)
	if why == "":
		last_care_at = now()
		save()
		changed.emit()
	return why


func land(fish: FishKind) -> void:
	FishingRules.land(state, fish)
	save()
	changed.emit()


func toggle_lights() -> void:
	tick()
	state.asleep = not state.asleep
	last_care_at = now()
	save()
	changed.emit()


func next_pet() -> void:
	var i := PET_IDS.find(state.pet)
	state.pet = PET_IDS[(i + 1) % PET_IDS.size()]
	save()
	changed.emit()


func next_speed() -> void:
	speed = SPEEDS[(SPEEDS.find(speed) + 1) % SPEEDS.size()]
	changed.emit()


func reset() -> void:
	state = PetRules.new_state(TUNING, OPTIONS, state.pet, now())
	save()
	changed.emit()


func save() -> void:
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(state))


func _load() -> Dictionary:
	var fresh := PetRules.new_state(TUNING, OPTIONS, PET_IDS[0], now())
	if not FileAccess.file_exists(SAVE_PATH):
		return fresh
	var data = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
	if typeof(data) != TYPE_DICTIONARY:
		return fresh
	# Anything missing from an older save comes from a fresh one.
	for k in fresh:
		if not data.has(k):
			data[k] = fresh[k]
	return data


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_APPLICATION_PAUSED:
		save()
