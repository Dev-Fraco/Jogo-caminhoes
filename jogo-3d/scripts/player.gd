extends CharacterBody3D
## Jogador em terceira pessoa: WASD anda, espaço pula, mouse gira a câmera.
## Esc libera o mouse; clique na tela para capturar de novo.

const SPEED := 8.0
const JUMP_VELOCITY := 7.0
const GRAVITY := 20.0
const MOUSE_SENSITIVITY := 0.003
const TOUCH_SENSITIVITY := 0.006  # radianos por pixel arrastado
const CAMERA_DISTANCE := 4.5
const PITCH_MIN := -1.2  # olhando para cima (negativo)
const PITCH_MAX := 0.3   # olhando para baixo (positivo)

var _pivot: Node3D
## Definido pelo mundo quando o aparelho tem tela de toque (celular).
var touch_hud = null  # touch_hud.gd (sem tipo fixo para acessar move_vector etc.)


func _ready() -> void:
	_build_body()
	_build_camera()
	if touch_hud == null:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _build_body() -> void:
	var capsule_shape := CapsuleShape3D.new()
	capsule_shape.radius = 0.4
	capsule_shape.height = 1.8
	var collision := CollisionShape3D.new()
	collision.shape = capsule_shape
	collision.position.y = 0.9
	add_child(collision)

	var capsule_mesh := CapsuleMesh.new()
	capsule_mesh.radius = 0.4
	capsule_mesh.height = 1.8
	var mesh_instance := MeshInstance3D.new()
	mesh_instance.mesh = capsule_mesh
	mesh_instance.position.y = 0.9
	var material := StandardMaterial3D.new()
	material.albedo_color = Color(0.9, 0.4, 0.1)
	mesh_instance.material_override = material
	add_child(mesh_instance)


func _build_camera() -> void:
	# O pivô fica na altura dos ombros e só inclina (pitch); o giro (yaw) é do próprio jogador.
	_pivot = Node3D.new()
	_pivot.name = "CameraPivot"
	_pivot.position.y = 1.5
	_pivot.rotation.x = -0.3
	add_child(_pivot)

	var camera := Camera3D.new()
	camera.name = "Camera"
	camera.position = Vector3(0.0, 0.0, CAMERA_DISTANCE)
	camera.current = true
	_pivot.add_child(camera)


func _unhandled_input(event: InputEvent) -> void:
	var button := event as InputEventMouseButton
	var key := event as InputEventKey
	var motion := event as InputEventMouseMotion

	if button and button.pressed:
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	elif key and key.pressed and key.keycode == KEY_ESCAPE:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
	elif motion and touch_hud == null and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		rotate_y(-motion.relative.x * MOUSE_SENSITIVITY)
		_pivot.rotation.x = clampf(
			_pivot.rotation.x - motion.relative.y * MOUSE_SENSITIVITY, PITCH_MIN, PITCH_MAX)


func _physics_process(delta: float) -> void:
	var jump_pressed := Input.is_physical_key_pressed(KEY_SPACE)
	var input := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_W):
		input.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S):
		input.y += 1.0
	if Input.is_physical_key_pressed(KEY_A):
		input.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D):
		input.x += 1.0

	if touch_hud:
		input += touch_hud.move_vector
		input = input.limit_length(1.0)
		rotate_y(-touch_hud.look_delta.x * TOUCH_SENSITIVITY)
		_pivot.rotation.x = clampf(
			_pivot.rotation.x - touch_hud.look_delta.y * TOUCH_SENSITIVITY, PITCH_MIN, PITCH_MAX)
		touch_hud.look_delta = Vector2.ZERO
		if touch_hud.jump_requested:
			jump_pressed = true
			touch_hud.jump_requested = false

	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	elif jump_pressed:
		velocity.y = JUMP_VELOCITY

	var direction := (transform.basis * Vector3(input.x, 0.0, input.y)).normalized()
	velocity.x = direction.x * SPEED
	velocity.z = direction.z * SPEED
	move_and_slide()
