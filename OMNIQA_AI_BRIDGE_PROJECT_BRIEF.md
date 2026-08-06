# OmniQA AI Bridge (Status: Po Sprincie 10)

## Wstęp i Cel Projektu
**OmniQA AI Bridge** to narzędzie CLI typu "glue", zaprojektowane do pośredniczenia pomiędzy lokalnymi systemami kodu a zaufanymi modelami językowymi LLM (np. Ollama). Projekt kładzie maksymalny nacisk na bezpieczeństwo korporacyjne — wymusza weryfikację skanowaniem, unika automatycznego modyfikowania kluczowych plików infrastruktury i zawsze zostawia ostateczną decyzyjność po stronie człowieka ("local first, cloud only when approved"). 

## Aktualny Stan Implementacji (Co Działa)

Mamy wdrożony kompletny i zabezpieczony cykl pracy: 
**Inicjalizacja → Skanowanie kontekstu → Zasilanie AI → Propozycja Zmiany → Aplikacja łatki.**

### Zaimplementowane Komendy

1. **`omniqa init`**
   - Inicjalizuje środowisko. Generuje bezpieczny plik konfiguracji `omniqa.yaml` na podstawie wbudowanych szablonów z najlepszymi praktykami. Konfiguracja domyślnie wykorzystuje providera `ollama`.
   
2. **`omniqa scan`**
   - Tworzy tzw. manifest projektowy (`.omniqa/index/`).
   - Podczas analizy katalogów, uruchamia silnik **Security Scannera** oparty o wyrażenia regularne i wykrywa wycieki kluczy (np. AWS, OpenAI). 
   
3. **`omniqa ask <pytanie>`**
   - Komenda "Read-only" pozwalająca zapytać LLM-a o wskazany plik.
   - **Flagi:** 
     - `--file <path>` / `-f`: Przekazuje wybrany plik jako kontekst.
     - `--provider <name>` / `-p`: Pozwala dynamicznie zmienić model/dostawcę w czasie działania komendy (obecnie wspierane: `mock`, `ollama`).
     - `--dry-run`: Symuluje wykonanie bez pingu do LLM, drukując wygenerowany prompt w konsoli i logując status "dry-run".
   - **Audyt:** Loguje wszystko w izolowanym folderze w `.omniqa/runs/<timestamp>_ask/result.json`.

4. **`omniqa dev <task>`**
   - Najważniejsza komenda planistyczna.
   - Generuje pełny zrzut zmodyfikowanego kodu.
   - Posiada wbudowany **Patch Manager (diff-generator)**, który w sposób deterministyczny wylicza różnicę między oryginalnym plikiem a odpowiedzią LLM (usuwając poetyckie wstępy AI), i generuje precyzyjny **Unified Diff** (`proposed.diff`). 
   - Jeżeli LLM pominął modyfikację (oddał to samo), system zwraca status "no-changes" w JSON i nie tworzy pustych łatek.
   - Loguje run do `.omniqa/runs/<timestamp>_dev`.
   
5. **`omniqa apply <run-id>`**
   - **Aplikacja Patcha.** Moduł operujący na dysku (Modyfikujący fizyczne pliki).
   - Oczekuje wyłącznie na nazwę folderu (np. `omniqa apply 20260806_213439Z_dev`).
   - **Weryfikacja "Pre-flight":** Automatycznie i w tle uruchamia `git apply --check -p0` z użyciem Node Subprocess. Sprawdza konflikty *przed* próbą zmiany.
   - Zabezpieczenie przed "**Double-Apply**": Po aplikacji ustawia znacznik `"appliedAt"` i blokuje każdą kolejną próbę wdrożenia tego samego patcha by nie psuć kontekstu Git.
   - **Interakcja @inquirer/prompts:** Na koniec, CLI pokazuje kolorowy pogląd Diffa (czerwony/zielony) i pyta o zgodę `(y/N)`. Defaultuje do `No` dla bezpieczeństwa! Po udanej akcji instruuje użytkownika, jak może wycofać zmianę (`git apply -R`).

### Warstwa Bezpieczeństwa (Security Core)
Warstwa, która przepina się przez *każdą* komendę odwołującą się do pliku.
- **`isRestrictedFile(filePath, stats)`**: Odrzuca pliki na podstawie nazwy lub ich rozmiaru. Odmawia procesowania lockfile'ów (np. `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`), tajnych rozszerzeń (`.env`, `*.pem`, `*.key`) i zabezpiecza limitem wielkości (Max 1MB).
- **`scanContentForSecrets(content)`**: Zanim dane polecą do Promptu LLM (nawet lokalnego), skanuje całą treść z użyciem RegExp i w przypadku znalezienia np. AWS Secret Access Key wyrzuca niemożliwy do pominięcia błąd `SecurityBlockError` zatrzymujący natychmiast wywołanie i zgłaszający alert o statusie `blocked` w pliku audytowym.
- **Audyt (Git Metadata)**: Na czas logowania JSON, wyciąga `gitBranch` oraz Hash Commita `gitCommit` dla pełnej transparentności audytowej z jakim stanem bazy zderzał się Agent podczas pracy.

## Architektura i Technologie
- **Język:** TypeScript (ESM, strict mode).
- **Core CLI:** `commander` (parsowanie CLI), `chalk` (kolorowanie logów), `@inquirer/prompts` (odpytywanie człowieka przed zmianami na dysku).
- **Pliki Zewnętrzne:** `yaml` (do czytania pliku `omniqa.yaml`).
- **Narzędzia Logiki/Diff:** Wbudowany `child_process` (dla operacji gita), paczka `diff` (tworzenie Unified Patches).
- **Testy:** `vitest` (Pełne 100% pokrycia dla izolowanych komponentów logicznych w `/src/core/*` oraz providery `/src/providers/*`).

## Struktura Konfiguracji (`omniqa.yaml`)
Domyslna (i wbudowana) struktura to:
```yaml
ai:
  provider: "ollama"       # domyślny dostawca wprowadzany z pliku
  model: "llama3:latest"   
  baseUrl: "http://localhost:11434"
context:
  ignore_patterns:
    - "node_modules/**"
    - "dist/**"
    - ".git/**"
```

## Czego jeszcze NIE ma (Ograniczenia & Planowane Moduły)
Poniższa funkcjonalność **nie jest** jeszcze zaimplementowana, co było celowym wstrzymaniem w fazie MVP:
- **Wieloplikowy kontekst (Multi-file Context)**: Na razie obsługiwane są tylko patche dla 1 konkretnego pliku podanego we fladze `-f`.
- **Cloud AI (OpenAI API / Anthropic / Gemini)**: Moduły zewnętrzne nie zostały zarejestrowane. Mamy klasę `MockProvider` do testów jednostkowych i wyizolowanego LLM'a z użyciem `OllamaProvider` na testy dev.
- **Flagi wymuszające automatyzację (--force / --yes)**: `omniqa apply` nie zawiera flag wymuszających. Celowo pominięto możliwość cichego wdrożenia kodu generowanego przez LLM na poczet bezpieczeństwa.
- **Automatyczny rollback (omniqa revert)**: System aktualnie tylko "podpowiada", że deweloper może wpisać w powłokę `git apply -R`. Nie zaimplementowano twardej komendy CLI do cofania.
- **Task Orchestrator & Tool Registry**: Koncepcja, by Agent mógł z własnej inicjatywy szukać plików czy używać terminala jest w pełni odroczona. Prowadzony model to czyste wejście/wyjście (File-in, Patch-out).
- **Report Interpreter**: Brak wbudowanego skanera wyników z testów np. `npm test` dla samorefleksji Agenta (Agent póki co bazuje na wyłącznym opisie tasku).
