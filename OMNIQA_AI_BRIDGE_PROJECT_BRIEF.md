# OmniQA AI Bridge

## Status: ZAMROŻONY (Frozen) — 2026-08-07

Decyzją z dnia 7 sierpnia 2026 r., projekt OmniQA AI Bridge zostaje formalnie wstrzymany. Nie jest to porzucenie prac, lecz kontrolowane zamrożenie z uwagi na bieżące ograniczenia technologiczne i korporacyjne.

### Powody zamrożenia
1. **Brak dostępu do API zewnętrznych modeli:** Obecnie nie posiadamy dostępu API do narzędzi takich jak Claude, Gemini, ani wewnętrznego `omniai.omc.com`. Zgodnie z FAQ Omnicomu: *"We don't currently have open API access to Omni AI tools and agents but that is part of our roadmap this year"* – brak konkretnego ETA. Wykorzystywanie zewnętrznych agentów do projektów klientów łamie politykę bezpieczeństwa, co blokuje główny cel powstania Bridge'a.
2. **Niewystarczające możliwości modeli lokalnych:** Lokalne modele (np. Ollama, `llama3:8B`) halucynują podczas zaawansowanych zadań takich jak analiza porównań wideo, sugerowanie poprawek kodu, czy nadzorowanie procesów QA. Orkiestrator bazujący wyłącznie na tych modelach nie spełnia wymagań jakościowych dla Managera QA w agencji reklamowej.
3. **Punkt wyjścia (New Video Compare API):** Zidentyfikowano cenne techniczne odkrycie – narzędzie "New Video Compare" (NVC) posiada działające, lokalne REST API (FastAPI, port `:8001`), używane obecnie przez rozszerzenie "Cradle Automation". Stanowi ono idealny, bezchmurowy punkt integracji dla przyszłego *Tool Registry*. 

### Warunki wznowienia prac (Odmrożenie)
Projekt zostanie przywrócony do aktywnego rozwoju wyłącznie w przypadku spełnienia co najmniej jednego z poniższych warunków:
- **Udostępnienie API przez Omnicom:** Oficjalny dostęp do `omniai.omc.com` lub autoryzowanych chmurowych modeli.
- **Dostęp do silnego modelu lokalnego:** Pojawienie się modelu lokalnego lub chmurowego (zgodnego z polityką korporacyjną), który udźwignie analitykę i poprawną modyfikację kodu w kontekście QA.

### Podsumowanie wdrożonych funkcjonalności (Gotowe do użycia)
W ramach Sprintów 0–11 zbudowano i przetestowano stabilny, zabezpieczony fundament CLI, który pozostaje nienaruszony i gotowy do przyszłej rozbudowy:
- **Pełny cykl CLI:** `omniqa init`, `scan`, `ask`, `dev`, `apply`.
- **Zarządzanie kontekstem:** Zaawansowana obsługa `--file`, `--files`, oraz rekurencyjnego `--dir` z deterministycznym sortowaniem.
- **Solidne Bezpieczeństwo:** Głębokie skanowanie sekretów (Regex) w locie, weryfikacja rozmiarów plików (Max 1MB cel, 500KB poboczne) oraz blokada niedozwolonych formatów i lockfile'ów.
- **Patch Manager:** Generowanie precyzyjnych, odizolowanych patchy z weryfikacją dry-run Git'a przed modyfikacją kodu.
- **100% Pokrycie Testami (Vitest):** System logiki, security oraz diff generator posiada 102 asercje strzegące stabilności kodu.

---

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
   - **Flagi kontekstowe (Mutually Exclusive):** 
     - `--file <path>` / `-f`: Przekazuje wybrany plik jako kontekst.
     - `--files <path1,path2>`: Przekazuje określoną listę plików jako kontekst.
     - `--dir <path>`: Przekazuje rekursywnie wszystkie pliki z podanego katalogu jako kontekst (z uwzględnieniem ignorowania, max rozmiaru na plik, max 20 plików, max 500 KB limitów).
   - **Inne Flagi:**
     - `--provider <name>` / `-p`: Pozwala dynamicznie zmienić model/dostawcę w czasie działania komendy (obecnie wspierane: `mock`, `ollama`).
     - `--dry-run`: Symuluje wykonanie bez pingu do LLM, drukując wygenerowany prompt w konsoli i logując status "dry-run".
   - **Audyt:** Loguje wszystko w izolowanym folderze w `.omniqa/runs/<timestamp>_ask/result.json`.

4. **`omniqa dev <task>`**
   - Najważniejsza komenda planistyczna.
   - Generuje pełny zrzut zmodyfikowanego kodu.
   - Posiada obsługę docelowego pliku `--file <path>` oraz dodatkowego, niemutowalnego tła `--context-files` i `--context-dir` dla głębszego zrozumienia taska przez LLM.
   - Posiada wbudowany **Patch Manager (diff-generator)**, który w sposób deterministyczny wylicza różnicę między oryginalnym plikiem a odpowiedzią LLM (usuwając poetyckie wstępy AI), i generuje precyzyjny **Unified Diff** (`proposed.diff`). 
   - Jeżeli LLM pominął modyfikację (oddał to samo), system zwraca status "no-changes" w JSON i nie tworzy pustych łatek.
   - Flaga `--dry-run` ułatwia testowanie bez wykorzystywania AI.
   - Loguje run do `.omniqa/runs/<timestamp>_dev`.
   
5. **`omniqa apply <run-id>`**
   - **Aplikacja Patcha.** Moduł operujący na dysku (Modyfikujący fizyczne pliki).
   - Oczekuje wyłącznie na nazwę folderu (np. `omniqa apply 20260806_213439Z_dev`).
   - **Weryfikacja "Pre-flight":** Automatycznie i w tle uruchamia `git apply --check -p0` z użyciem Node Subprocess. Sprawdza konflikty *przed* próbą zmiany.
   - Zabezpieczenie przed "**Double-Apply**": Po aplikacji ustawia znacznik `"appliedAt"` i blokuje każdą kolejną próbę wdrożenia tego samego patcha by nie psuć kontekstu Git.
   - **Interakcja @inquirer/prompts:** Na koniec, CLI pokazuje kolorowy pogląd Diffa (czerwony/zielony) i pyta o zgodę `(y/N)`. Defaultuje do `No` dla bezpieczeństwa! Po udanej akcji instruuje użytkownika, jak może wycofać zmianę (`git apply -R`).

### Warstwa Bezpieczeństwa (Security Core)
Warstwa, która przepina się przez *każdą* komendę odwołującą się do pliku.
- **`isRestrictedFile(filePath, stats)`**: Odrzuca pliki na podstawie nazwy lub ich rozmiaru. Odmawia procesowania lockfile'ów (np. `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`), tajnych rozszerzeń (`.env`, `*.pem`, `*.key`) i zabezpiecza limitem wielkości (Max 1MB dla plików docelowych, 500KB dla połączonego kontekstu pobocznego).
- **`scanContentForSecrets(content)`**: Zanim dane polecą do Promptu LLM (nawet lokalnego), skanuje całą treść z użyciem RegExp i w przypadku znalezienia np. AWS Secret Access Key wyrzuca niemożliwy do pominięcia błąd `SecurityBlockError` zatrzymujący natychmiast wywołanie i zgłaszający alert o statusie `blocked` w pliku audytowym. Działa również dynamicznie na masowe dołączane pliki.
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
- **Cloud AI (OpenAI API / Anthropic / Gemini)**: Moduły zewnętrzne nie zostały zarejestrowane. Mamy klasę `MockProvider` do testów jednostkowych i wyizolowanego LLM'a z użyciem `OllamaProvider` na testy dev.
- **Flagi wymuszające automatyzację (--force / --yes)**: `omniqa apply` nie zawiera flag wymuszających. Celowo pominięto możliwość cichego wdrożenia kodu generowanego przez LLM na poczet bezpieczeństwa.
- **Automatyczny rollback (omniqa revert)**: System aktualnie tylko "podpowiada", że deweloper może wpisać w powłokę `git apply -R`. Nie zaimplementowano twardej komendy CLI do cofania.
- **Task Orchestrator & Tool Registry**: Koncepcja, by Agent mógł z własnej inicjatywy szukać plików czy używać terminala jest w pełni odroczona. Prowadzony model to czyste wejście/wyjście (File-in, Patch-out).
- **Report Interpreter**: Brak wbudowanego skanera wyników z testów np. `npm test` dla samorefleksji Agenta (Agent póki co bazuje na wyłącznym opisie tasku).
