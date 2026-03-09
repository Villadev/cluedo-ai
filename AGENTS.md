# Backend Development Rules

These rules apply to the **backend Node.js API**.

The backend is the **source of truth** for the game and exposes all functionality through a **documented API**.

Technologies used:

* Node.js
* Express
* TypeScript
* OpenAI SDK
* Swagger / OpenAPI

---

# Backend Architecture

The backend must follow a clear architecture:

```
backend/src

routes/
controllers/
services/
game/
ai/
config/
```

Responsibilities:

routes → define API endpoints
controllers → handle HTTP requests and responses
services → business logic
game → game engine logic (turns, roles, secrets, accusations)
ai → OpenAI integration and prompt management
config → environment configuration

Rules:

* Do not mix responsibilities
* Game logic must **never live inside controllers**
* Controllers must remain **thin**

---

# TypeScript Backend Rules

* Use **strict TypeScript**
* Avoid `any`
* Use explicit interfaces for API models
* Use `async/await` instead of raw promises
* Use clear error handling

Example error handling pattern:

```
try {
  const result = await service.execute()
  res.json({ success: true, data: result })
} catch (error) {
  res.status(500).json({ success: false, error: "Internal server error" })
}
```

---

# API Response Format

All endpoints must return consistent responses.

Success:

```
{
  "success": true,
  "data": {}
}
```

Error:

```
{
  "success": false,
  "error": "error message"
}
```

---

# Swagger / OpenAPI Rule (CRITICAL)

Swagger is the **official documentation and testing interface for the API**.

Whenever an endpoint is:

* created
* modified
* extended
* renamed

Swagger **must be updated immediately**.

Each endpoint must include:

* summary
* description
* parameters
* requestBody (if applicable)
* responses

Example:

```
/games/start:
  post:
    summary: Start a new game
    description: Creates a new Cluedo-style game session
```

Swagger **must remain functional at all times**.

If Swagger breaks or becomes inconsistent with the API implementation, the change is considered **invalid and must be fixed**.

---

# API Evolution Rules

When modifying an existing endpoint:

* Do not break existing responses
* Maintain backward compatibility when possible
* Update Swagger documentation
* Update related controllers and services consistently

---

# Logging and Debugging

The backend should provide clear logs for:

* game creation
* player actions
* AI interactions
* accusations
* game resolution

Avoid excessive logging of large prompts or sensitive game secrets.

---

# OpenAI Integration Rules

All OpenAI interactions must be centralized inside the **ai/** module.

Rules:

* Do not call OpenAI directly from controllers
* Use structured prompts
* Avoid sending unnecessary context
* Minimize token usage

Preferred structure:

```
system → AI Game Master behaviour
context → structured game state
user → player interaction
```

Example:

```
system: You are the Game Master of a murder mystery game.

context:
{
  killer: "...",
  weapon: "...",
  location: "...",
  suspects: [...]
}

user: Player question
```

---

# Game Engine Rules

The backend is the **deterministic game engine**.

The AI only generates **narrative text**.

The backend controls:

* killer identity
* murder weapon
* murder location
* player roles
* secret clues
* turn order
* accusations
* game end conditions

The AI must **never modify or invent game state**.

---

# Frontend / Backend Separation

The frontends:

* **player-ui**
* **master-ui**

must only:

* call backend APIs
* render UI
* display narrative

Frontends must **never implement game logic**.

All game logic must remain inside the backend.
