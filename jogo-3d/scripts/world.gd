extends Node3D
## Monta o mundo 3D: céu, sol, chão, obstáculos e o jogador.
## Tudo é criado por código para a cena principal ficar mínima e fácil de mexer.

const PLAYER_SCRIPT := preload("res://scripts/player.gd")
const WORLD_SIZE := 200.0
const OBSTACLE_COUNT := 40


func _ready() -> void:
	_build_environment()
	_build_ground()
	_build_obstacles()
	_build_player()


func _build_environment() -> void:
	var sky_material := ProceduralSkyMaterial.new()
	var sky := Sky.new()
	sky.sky_material = sky_material

	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.8

	var world_env := WorldEnvironment.new()
	world_env.environment = env
	add_child(world_env)

	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50.0, -30.0, 0.0)
	sun.shadow_enabled = true
	add_child(sun)


func _build_ground() -> void:
	_add_block(Vector3(0.0, -0.5, 0.0), Vector3(WORLD_SIZE, 1.0, WORLD_SIZE),
		Color(0.32, 0.55, 0.3), "Ground")


func _build_obstacles() -> void:
	var rng := RandomNumberGenerator.new()
	rng.seed = 42  # mesma disposição sempre; troque para randomizar

	for i in range(OBSTACLE_COUNT):
		var size := Vector3(rng.randf_range(1.0, 5.0), rng.randf_range(1.0, 4.0), rng.randf_range(1.0, 5.0))
		var pos := Vector3(
			rng.randf_range(-WORLD_SIZE * 0.4, WORLD_SIZE * 0.4),
			size.y * 0.5,
			rng.randf_range(-WORLD_SIZE * 0.4, WORLD_SIZE * 0.4))
		if Vector2(pos.x, pos.z).length() < 8.0:
			continue  # deixa espaço livre perto do ponto de spawn
		var color := Color.from_hsv(rng.randf(), 0.25, 0.75)
		_add_block(pos, size, color, "Obstacle%d" % i)


func _build_player() -> void:
	var player: CharacterBody3D = PLAYER_SCRIPT.new()
	player.name = "Player"
	player.position = Vector3(0.0, 1.0, 0.0)
	add_child(player)


## Cria um bloco estático com colisão.
func _add_block(pos: Vector3, size: Vector3, color: Color, node_name: String) -> void:
	var body := StaticBody3D.new()
	body.name = node_name
	body.position = pos

	var mesh_instance := MeshInstance3D.new()
	var box_mesh := BoxMesh.new()
	box_mesh.size = size
	mesh_instance.mesh = box_mesh
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	mesh_instance.material_override = material
	body.add_child(mesh_instance)

	var shape := CollisionShape3D.new()
	var box_shape := BoxShape3D.new()
	box_shape.size = size
	shape.shape = box_shape
	body.add_child(shape)

	add_child(body)
