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
	await get_tree().process_frame
	check("feed drawer opens with 3 foods", main.get_node("%List").get_child_count() == 3)
	main.get_node("%List").get_child(0).pressed.emit() # rice ball
	await get_tree().process_frame
	check("eating plays", pet.body.animation == &"eat")
	check("face chews", pet.face.animation == &"chewing")
	check("rice ball used", Game.state.inventory.riceBall == 2)
	check("tummy went up", Game.state.stats.hunger > 90.0)
	await get_tree().create_timer(4.4).timeout
	check("back to cheerful after eating", pet.body.animation == &"cheerful")

	main.get_node("%Lights").pressed.emit()
	await get_tree().process_frame
	check("lights off: asleep", Game.state.asleep and pet.body.animation == &"sleep")
	check("room dims", main.get_node("%Dim").visible)
	main.get_node("%Play").pressed.emit()
	await get_tree().process_frame
	main.get_node("%List").get_child(0).pressed.emit() # cuddle
	await get_tree().process_frame
	check("can't play while asleep", main.get_node("%Toast").visible)
	main.get_node("%Lights").pressed.emit()

	for i in Game.PETS.size():
		Game.next_pet()
		await get_tree().process_frame
		check("%s shows" % Game.pet_name(), pet.body.sprite_frames == Game.look().frames)

	Game.reset()
	print("screen test: %s" % ("passed" if failed == 0 else "%d failed" % failed))
	get_tree().quit(1 if failed else 0)
