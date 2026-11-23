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
	check("feed sheet opens with 3 foods", main.get_node("%Grid").get_child_count() == 3)
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

	for i in Game.PETS.size():
		Game.next_pet()
		await get_tree().process_frame
		check("%s shows" % Game.pet_name(), pet.body.sprite_frames == Game.look().frames)

	Game.reset()
	print("screen test: %s" % ("passed" if failed == 0 else "%d failed" % failed))
	get_tree().quit(1 if failed else 0)
