import sys

socket_path = 'apps/backend/src/websocket/socket.ts'
with open(socket_path, 'r') as f:
    content = f.read()

# Add pipeline logs to sendNarratorMessage
old_log = '  console.log(`WS_EMIT: ${type} chat message to room ${gameId}: ${message}`);'
new_log = '  console.log(`[PIPELINE] Enqueuing narrator message for game ${gameId}`);\n  console.log(`[PIPELINE] Emitting ${type} to room: ${message}`);'

content = content.replace(old_log, new_log)

with open(socket_path, 'w') as f:
    f.write(content)

# Remove debug log from game-engine
engine_path = 'apps/backend/src/engine/game-engine.ts'
with open(engine_path, 'r') as f:
    content = f.read()

content = content.replace('    console.log("NARRATOR RESULT:", response, clue);\n', '')

with open(engine_path, 'w') as f:
    f.write(content)

print("Applied final pipeline enhancements and cleaned up logs")
