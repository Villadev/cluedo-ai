import sys

file_path = 'apps/backend/src/services/AIService.ts'
with open('AIService.ts.bak', 'r') as f:
    content = f.read()

# 1. Update respondToQuestion prompt to request a clue
search_respond_question = """    const instruction = `Respon la pregunta de l'investigador de manera molt directa i breu (màxim 15 paraules).
${diffContext}
Regles:
- No utilitzis metàfores ni descripcions poètiques.
- Dona una pista subtil o un fet concret si és possible.
- Sigues enigmàtic però concís.
- Respon sempre en català.`;"""

updated_instruction = """    const instruction = `Respon la pregunta de l'investigador de manera molt directa i breu (màxim 15 paraules).
${diffContext}
Regles:
- No utilitzis metàfores ni descripcions poètiques.
- Dona una pista subtil o un fet concret si és possible.
- Sigues enigmàtic però concís.
- Respon sempre en català.
- Si ho creus oportú per la ronda actual, afegeix una pista addicional separada per '---'.`;"""

if search_respond_question in content:
    content = content.replace(search_respond_question, updated_instruction)
else:
    print("Error: Could not find respondToQuestion insertion point")
    sys.exit(1)

with open(file_path, 'w') as f:
    f.write(content)
print("Successfully updated AIService.ts")
