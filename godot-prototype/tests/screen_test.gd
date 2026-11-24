extends Node
## Opens the real home screen with no window and presses its buttons, to
## check the scene, the drawers and the pet's reactions are wired up. Run:
##   godot --headless --path godot-prototype res://tests/screen_test.tscn

var failed := 0


func check(what: String, ok: bool) -> void:
	print(("ok    " if ok else "FAIL  ") + what)
	if not ok:
		failed += 1


func _ready() -> void:
	Game.reset()
	var main: Control = load("res://scenes/main.tscn").instantiate()
	add_child(main)
	await get_tree().process_frame
	var pet := main.get_node("%Pet")
	check("pet is shown", pet.body.sprite_frames != null)
	check("pet starts cheerful", pet.body.animation == &"cheerful")

	main.get_node("%Feed").pressed.emit()
	await get_tree().create_timer(0.4).timeout
	check("feed sheet shows every food", main.get_node("%Grid").get_child_count() == Game.options(CareOption.Kind.FOOD).size())
	check("room folds up for the sheet", main.fold == 1.0)
	main.get_node("%Go").pressed.emit() # the rice ball is picked
	await get_tree().process_frame
	check("eating plays", pet.body.animation == &"eat")
	check("face chews", pet.face.animation == &"chewing")
	check("rice ball used", Game.state.inventory.riceBall == 2)
	check("tummy went up", Game.state.stats.hunger > 90.0)
	await get_tree().create_timer(4.4).timeout
	check("back to cheerful after eating", pet.body.animation == &"cheerful")
	main.get_node("%More").pressed.emit() # "×" closes the sheet
	await get_tree().create_timer(0.4).timeout
	check("sheet closed, room full height", main.fold == 0.0 and not main.get_node("%Sheet").visible)

	main.get_node("%Moon").pressed.emit()
	await get_tree().process_frame
	check("lights off: asleep", Game.state.asleep and pet.body.animation == &"sleep")
	check("room dims", main.get_node("%Dim").visible)
	main.get_node("%More").pressed.emit()
	await get_tree().process_frame
	check("menu opens", main.get_node("%Pop").visible)
	main.get_node("%PopList").get_node("play").pressed.emit()
	await get_tree().create_timer(0.4).timeout
	check("play sheet opens with 2 games", main.get_node("%Grid").get_child_count() == 2)
	main.get_node("%Go").pressed.emit()
	await get_tree().process_frame
	check("can't play while asleep", main.get_node("%Toast").visible)
	main.get_node("%Moon").pressed.emit()
	main.close_all()

	main.get_node("%MapButton").pressed.emit()
	await get_tree().create_timer(0.3).timeout
	var map: Control = main.get_node("%Map")
	check("map opens", map.visible and map.map_id == "island")
	check("bubbles on the island", map.get_node("Marks").get_child_count() >= 4)
	map.zoom_into("backyard", "backyard")
	await get_tree().create_timer(0.8).timeout
	check("zoomed into the Backyard", map.map_id == "backyard")
	map.zoom_out()
	await get_tree().create_timer(0.8).timeout
	check("back on the island", map.map_id == "island")
	map.get_node("%Home").pressed.emit()
	await get_tree().create_timer(0.3).timeout
	check("home again", not map.visible)

	# Fishing: the pond on the map, a cast, a bite, reeling in and a catch.
	main.get_node("%MapButton").pressed.emit()
	await get_tree().create_timer(0.3).timeout
	map._activate("pond")
	await get_tree().create_timer(0.8).timeout
	var fishing: Control = main.get_node("%Fishing")
	var cast_button: Button = main.get_node("%FishMain")
	check("the pond opens fishing", fishing.visible and fishing.phase == "ready" and not map.visible)
	check("the dock makes way", not main.get_node("%Dock").visible)
	check("the rod is out", main.get_node("%Rod").visible)
	var energy: float = Game.state.stats.energy
	cast_button.pressed.emit()
	check("Cast throws the line", fishing.phase == "waiting" and cast_button.text == "Reel in")
	check("casting costs energy", Game.state.stats.energy < energy)
	cast_button.pressed.emit()
	check("reeling in too soon scares it", fishing.phase == "ready" or cast_button.disabled)
	await get_tree().process_frame
	await get_tree().process_frame
	cast_button.pressed.emit()
	fishing._timers.clear()
	fishing._bite()
	check("a bite", fishing.phase == "bite")
	cast_button.pressed.emit()
	check("Reel in brings up the bar", fishing.phase == "reeling" and main.get_node("%CatchBar").visible and cast_button.text == "Pull")
	var fish_id: String = fishing._hooked.food.id
	var had := int(Game.state.inventory.get(fish_id, 0))
	fishing._reel.meter = 0.99
	fishing._reel.marker = fishing._reel.center
	fishing._reel.elapsed = 3.0
	cast_button.button_down.emit()
	await get_tree().create_timer(0.3).timeout
	cast_button.button_up.emit()
	check("a landed fish goes in the pantry", int(Game.state.inventory.get(fish_id, 0)) == had + 1)
	await get_tree().create_timer(1.0).timeout
	check("ready to cast again", fishing.phase == "ready" and cast_button.text == "Cast")
	main.get_node("%FishCancel").pressed.emit()
	await get_tree().create_timer(0.6).timeout
	check("Cancel drains the pond", not fishing.visible and main.get_node("%Dock").visible)

	for i in Game.PETS.size():
		Game.next_pet()
		await get_tree().process_frame
		check("%s shows" % Game.pet_name(), pet.body.sprite_frames == Game.look().frames)

	Game.reset()
	print("screen test: %s" % ("passed" if failed == 0 else "%d failed" % failed))
	get_tree().quit(1 if failed else 0)
