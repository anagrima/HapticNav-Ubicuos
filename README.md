🧭 HapticNav, por Alicia Mei García Morín, Laura Guerrero Canales y Ana Grima Vázquez de Prada
> Prototipo de navegación peatonal háptica basado en geolocalización, comandos de voz y modo acompañante en tiempo real.


# Requisitos
* Node.js 
* npm
* Un navegador web moderno (Chrome recomendado)
* Un teléfono móvil con:
  * GPS activado
  * Permisos de ubicación
  * Acelerómetro (para el gesto de agitar)
  * Micrófono (para comandos de voz)
* Ordenador y móvil conectados a la misma red WiFi


# Instalación
Desde la carpeta del proyecto, ejecutar:
```bash
npm install
npm start
```

Tras ejecutar el comando, el servidor se iniciará y aparecerá un mensaje similar a: 
Server running on http://localhost:3000


# Cómo probar el sistema (ejemplo de ordenador acompañante y móvil usuario principal)

## Paso 1 — Abrir la aplicación en el ordenador (Acompañante)
Abrir en el navegador: http://localhost:3000
Seleccionar: Acompañante
Introducir un código de sala (por ejemplo): sala1

## Paso 2 — Abrir la aplicación en el móvil (Usuario principal)
En el navegador del móvil, introducir la dirección IP del ordenador: http://IP_ORDENADOR:3000
Seleccionar: Usuario principal
Introducir:
* Código de sala (el mismo que el acompañante)
* Destino
y pulsar: Confirmar destino
# Flujo de uso del sistema
1. Introducir el destino
2. Leer las instrucciones iniciales
3. Pulsar: Iniciar trayecto

A partir de ese momento aparecerá la pantalla principal del usuario, donde se podrá:

* Recibir indicaciones mediante vibración
* Ver la distancia restante
* Ver el tiempo estimado
* Recibir mensajes del acompañante
* Pausar la ruta
* Reanudar la ruta
* Recalcular la ruta

---

# Comandos de voz
Para activar la escucha:
* Agitar el móvil
  o
* Pulsar el botón de voz
Los comandos implementados se encuentran en la función: handleVoiceCommand()


## Ejemplo de prueba recomendada

1. Agitar el móvil
2. Decir:
```
pausa ruta
```
3. Aparecerá la pantalla de ruta pausada
4. Agitar el móvil
5. Decir:
```
reanuda ruta
```
6. Agitar el móvil
7. Decir:
```
cuanto falta
```
8. Agitar el móvil
9. Decir:
```
perdido
```
Se observará en pantalla:

```
Recalculando ruta
```

---

# Funcionalidades del modo acompañante

El acompañante puede:

* Ver el mapa con la posición del usuario
* Visualizar el recorrido
* Ver las indicaciones actuales
* Ver el estado del usuario:

  * Detenido
  * En movimiento
  * Perdido
* Enviar mensajes rápidos
* Consultar el historial de eventos

---

# Notas importantes

## Precisión del GPS

Si el usuario se encuentra a más de aproximadamente 35 metros de una carretera,
el sistema no será capaz de generar una ruta válida y mostrará continuamente:
```
Recalculando ruta
```
(Esto se debe a limitaciones de los servicios de geolocalización y cálculo de rutas)

---

## Permisos necesarios
El navegador debe tener permisos para:
* Ubicación
* Micrófono
* Sensores de movimiento
---

## Detener el servidor
Para finalizar la ejecución del servidor:
```bash
Ctrl + C
```

