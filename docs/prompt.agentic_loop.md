I have an existing VS Code extension called Snippetor and an existing
UML editor/integration called UMLSync.

I want to add an agentic code-understanding workflow to Snippetor.

IMPORTANT:

DO NOT IMPLEMENT ANYTHING YET.

First analyze the existing repository and produce a detailed,
repository-specific implementation plan.

Do not assume the architecture described below already matches the
repository. Inspect the actual code first and adapt the proposal to
what already exists.

======================================================================
1. PRODUCT CONCEPT
======================================================================

Snippetor is a tool for creating Software Architecture Snippets.

The main purpose of a Software Architecture Snippet is:

    EXPLAIN HOW A PIECE OF CODE WORKS.

A snippet is primarily a guided walkthrough through real source code.

Conceptually:

    Software Architecture Snippet
        |
        +-- ordered source-code locations
        |      |
        |      +-- source range
        |      +-- explanation/comment
        |
        +-- UMLSync diagram(s)
        |
        +-- ordering / walkthrough structure

A simplified example:

    "How WebXR session creation works"

    Step 1
    navigator_xr.cc
    NavigatorXR::requestSession()

    Explanation:
    This is the Blink entry point for the WebXR API.

        ↓

    Step 2
    xr_system.cc
    XRSystem::requestSession()

    Explanation:
    This validates the request and starts communication with
    the browser process.

        ↓

    [UMLSync sequence/component diagram]

        ↓

    Step 3
    xr_service.mojom

    Explanation:
    This interface represents the renderer/browser process boundary.

        ↓

    Step 4
    browser-side implementation

        ↓

    [another UMLSync diagram, if useful]


The source walkthrough and diagrams together explain the architecture.

IMPORTANT PRODUCT PRINCIPLE:

UMLSync diagrams are NOT the primary artifact.

They complement the source-code walkthrough.

A Software Architecture Snippet may contain:

- no diagram
- one diagram
- multiple diagrams

depending on what best explains the code.

The agent should decide when a diagram adds explanatory value.

The goal is NOT:

    source code → generate UML

The goal is:

    source code
        ↓
    investigate architecture
        ↓
    understand important execution / dependency / ownership paths
        ↓
    create an understandable guided explanation
        ↓
    source walkthrough + diagrams
        ↓
    Software Architecture Snippet


======================================================================
2. PRIMARY AGENT GOAL
======================================================================

I want to create a Snippetor Architecture Agent.

A user should eventually be able to ask something like:

    "Explain how WebXR session creation works."

or:

    "Explain how this class communicates with the browser process."

or:

    "Explain how this Android API reaches the native implementation."

The agent should explore the codebase incrementally.

Conceptually:

    User Goal
        ↓
    Snippetor Architecture Agent
        ↓
    LLM
        ↓
    choose semantic/code exploration tool
        ↓
    VS Code Code Intelligence
        ↓
    Language Provider
        ↓
    result
        ↓
    LLM
        ↓
    choose next investigation step
        ↓
    ...
        ↓
    Architecture Understanding
        ↓
    Software Architecture Snippet
        |
        +-- code walkthrough
        |
        +-- explanations
        |
        +-- UMLSync diagram(s)


The important part is the EXPLORATION LOOP.

The LLM should not receive the entire repository.

It should navigate through the code similarly to an experienced
developer:

    find symbol
        ↓
    inspect definition
        ↓
    inspect implementation
        ↓
    inspect callers
        ↓
    inspect callees
        ↓
    follow important dependency
        ↓
    cross language/process boundary
        ↓
    inspect relevant implementation
        ↓
    decide what matters
        ↓
    construct explanation


======================================================================
3. TARGET CODEBASE
======================================================================

The first major test repository will be Chromium.

Chromium is intentionally a difficult test case because architecture
crosses multiple languages and systems:

- C/C++
- Java
- Kotlin
- JavaScript / TypeScript
- Mojom
- generated code
- GN build metadata
- JNI
- renderer/browser process boundaries

Typical architecture paths may look like:

    Java
      ↓
    JNI
      ↓
    C++
      ↓
    Mojo
      ↓
    C++
      ↓
    Blink

or:

    JavaScript Web API
      ↓
    Blink
      ↓
    C++
      ↓
    Mojo
      ↓
    Browser Process


The MVP does NOT need to solve every cross-language transition.

However, the architecture must allow this to be added incrementally.


======================================================================
4. CRITICAL ARCHITECTURAL PRINCIPLE
======================================================================

DO NOT BUILD OUR OWN GENERAL-PURPOSE CODE INDEXER OR LANGUAGE PARSER.

VS Code already has semantic language infrastructure.

The environment may contain:

- clangd for C/C++
- Google ChromiumIDE / Google.cros-ide
- Java language support
- Mojom language-server support
- TypeScript language services
- Kotlin support
- other language providers

The Snippetor agent should consume semantic information through
VS Code whenever possible.

Preferred architecture:

    Snippetor Agent
           ↓
    Agent Tools
           ↓
    CodeIntelligence abstraction
           ↓
    VS Code semantic APIs
           ↓
    registered language providers


The agent should generally NOT know whether a result came from:

- clangd
- ChromiumIDE
- Mojom LS
- TypeScript LS
- another language provider


======================================================================
5. ANALYZE THE EXISTING REPOSITORY FIRST
======================================================================

Before proposing changes, inspect the repository thoroughly.

Identify:

- VS Code extension entry point
- extension activation
- command registration
- existing source navigation functionality
- existing workspace abstraction
- existing source-location representation
- existing comment/snippet model
- existing Software Architecture Snippet representation
- snippet serialization
- snippet ordering/walkthrough model
- version-control/source-version handling
- existing context extraction
- existing AI functionality
- existing skills functionality
- existing MCP-related code, if any
- UMLSync integration
- UMLSync JSON format
- diagram creation/opening flow
- logging
- OutputChannel usage
- tests
- persistence
- UI integration points

For each relevant existing component, provide:

- file
- class/function
- responsibility
- whether it should be reused, modified, or left unchanged

DO NOT create parallel models if an appropriate model already exists.


======================================================================
6. CODE INTELLIGENCE ABSTRACTION
======================================================================

Design a language-agnostic CodeIntelligence layer.

Conceptually:

    Agent
      ↓
    AgentTool
      ↓
    CodeIntelligence
      ↓
    VS Code
      ↓
    Language Provider


Investigate support for operations equivalent to:

    findSymbol(query)

    findDefinition(symbol/location)

    findDeclaration(symbol/location)

    findReferences(symbol/location)

    findImplementations(symbol/location)

    getDocumentSymbols(uri)

    getWorkspaceSymbols(query)

    getCallHierarchy(symbol/location)

    getIncomingCalls(symbol/location)

    getOutgoingCalls(symbol/location)

    getTypeHierarchy(symbol/location)

    getSupertypes(symbol/location)

    getSubtypes(symbol/location)

    getHover(symbol/location)

    readSource(location/range)

    searchText(query)


Determine the actual VS Code APIs/commands available for each.

Investigate things such as:

    vscode.executeDefinitionProvider
    vscode.executeDeclarationProvider
    vscode.executeReferenceProvider
    vscode.executeImplementationProvider
    vscode.executeDocumentSymbolProvider
    vscode.executeWorkspaceSymbolProvider
    vscode.executeHoverProvider

and the appropriate APIs for:

- call hierarchy
- type hierarchy


Do not assume every language provider supports every operation.

Design capability detection and graceful fallbacks.


======================================================================
7. STABLE CODE REFERENCES
======================================================================

The LLM should NOT be expected to invent:

    file + line + column

for subsequent tool calls.

Tool results should return stable references that can be reused.

Investigate whether existing Snippetor source-location models can
already serve this purpose.

Conceptually:

    SymbolRef {
        id
        name
        kind
        uri
        range
        selectionRange
    }

and:

    SourceRef {
        id
        uri
        range
        symbol?
    }


Example:

    findSymbol("XRSession")

returns:

    SymbolRef("symbol-17")

Then:

    findDefinition("symbol-17")

instead of asking the LLM to reproduce coordinates.

Similarly:

    readSource("source-42")

This reduces malformed tool calls and makes the agent protocol safer.

Reuse existing Snippetor source-reference/version models wherever
possible.


======================================================================
8. AGENT TOOL LAYER
======================================================================

Design a minimal generic tool abstraction.

Conceptually:

    interface AgentTool<TInput, TOutput> {
        name: string;
        description: string;
        inputSchema: ...;

        execute(
            input: TInput,
            context: ToolContext
        ): Promise<TOutput>;
    }


Initial semantic tools may include:

    find_symbol

    find_definition

    find_declaration

    find_references

    find_implementations

    get_document_symbols

    get_call_hierarchy

    get_type_hierarchy

    get_hover

    read_source

    search_text


The LLM should see small, clear semantic operations.

Do not expose unnecessary VS Code implementation details.


======================================================================
9. CHROMIUMIDE / GOOGLE.CROS-IDE
======================================================================

The user may have Google's VS Code extension:

    Google.cros-ide

installed when working with Chromium.

Investigate:

1. What semantic capabilities it contributes through standard VS Code
   providers.

2. Whether it exports a documented public extension API.

3. Which commands it contributes that may be useful.

4. Whether Snippetor can benefit from it indirectly through VS Code.

5. Whether any direct integration provides important functionality
   unavailable through standard VS Code APIs.


Prefer:

    Snippetor
        ↓
    VS Code API
        ↓
    Google.cros-ide

over:

    Snippetor
        ↓
    ChromiumIDE private internals


Avoid hard dependencies unless justified.


======================================================================
10. MOJOM
======================================================================

Investigate existing Mojom language-server support in the Chromium
development environment.

Determine which semantic operations work for .mojom:

- symbols
- definitions
- references
- hover
- navigation
- other useful semantic operations

Do NOT build a Mojom parser for the MVP.

However, document semantic gaps.

For example, generic navigation may understand:

    interface Foo

but may not understand the architectural meaning of:

    mojo::Remote<Foo>

    mojo::Receiver<Foo>

    PendingRemote<Foo>

    PendingReceiver<Foo>


These gaps may justify Chromium-specific tools later.


======================================================================
11. CROSS-LANGUAGE ARCHITECTURE
======================================================================

The long-term agent should understand paths such as:

    Java
      ↓
    JNI
      ↓
    C++
      ↓
    Mojo
      ↓
    C++
      ↓
    Blink


Do NOT implement this entire system now.

During repository/API analysis determine:

- where VS Code semantic navigation works automatically
- where it stops
- where generated code helps
- where Chromium-specific knowledge is required


Document possible future specialized tools such as:

    find_jni_binding

    find_mojom_interface

    find_mojo_remote_users

    find_mojo_receiver_users

    find_generated_source

    find_gn_target

    find_gn_dependencies


These should NOT be part of the first implementation unless one is
trivial using existing infrastructure.


======================================================================
12. AGENTIC LOOP
======================================================================

Design the smallest understandable agent loop.

I want to control the loop myself rather than immediately adopting a
large agent framework.

Conceptually:

    while (!finished && iteration < maxIterations) {

        response = await llm.run(activeContext);

        if (response.toolCall) {

            result = await tools.execute(response.toolCall);

            knowledge.add(result);

            activeContext.update(result);

            continue;
        }

        if (response.finalResult) {

            validate(response.finalResult);

            return response.finalResult;
        }
    }


The loop should consider:

- maximum iterations
- cancellation
- timeout
- LLM failure
- tool failure
- malformed tool calls
- repeated tool calls
- context limits
- structured final output
- logging
- tracing


Do not over-engineer these mechanisms for the MVP.


======================================================================
13. LLM PROVIDER
======================================================================

The agent loop should not depend on one LLM vendor.

Design a minimal abstraction such as:

    interface LLMProvider {
        run(request: AgentRequest): Promise<AgentResponse>;
    }


The architecture should eventually allow:

LOCAL

- Ollama
- llama.cpp
- OpenAI-compatible local server

CLOUD

- OpenAI
- Anthropic


Do NOT implement all providers.

Recommend ONE provider for the first experiment.

Prefer structured tool calling where practical.

The important architectural property is:

changing the LLM must NOT require changing:

- AgentLoop
- AgentTools
- CodeIntelligence
- Snippet model
- UMLSync integration


======================================================================
14. AGENT KNOWLEDGE VS LLM CONTEXT
======================================================================

This distinction is important.

Chromium is enormous.

The agent may discover a large amount of information during
exploration.

Do NOT simply append everything to the LLM conversation forever.

Separate:

    Agent Knowledge

from:

    Active LLM Context


Agent Knowledge may contain:

- discovered symbols
- discovered source locations
- explored files
- relationships
- tool results
- candidate walkthrough steps
- architecture observations
- diagram candidates


Active LLM Context should contain only what the model currently needs.

Design an MVP strategy.

For example:

    original goal
    +
    compact exploration history
    +
    important discovered entities
    +
    selected source snippets
    +
    current working hypothesis


Old raw source/tool results may be:

- dropped from active context
- summarized
- retained only in Agent Knowledge


Do NOT introduce:

- embeddings
- vector DB
- repository RAG infrastructure

for the first version.


======================================================================
15. ARCHITECTURE UNDERSTANDING MODEL
======================================================================

Consider whether the agent needs a small internal working model before
producing the final Snippet.

Conceptually:

    ArchitectureKnowledge {
        entities
        relationships
        sourceEvidence
        executionPaths
        importantBoundaries
        candidateWalkthroughSteps
        diagramCandidates
    }


This is NOT necessarily a persistent product model.

It may simply be transient AgentState.

The important requirement is that every explanation or relationship
included in the final snippet should be grounded in source locations
the agent actually inspected.

Avoid unsupported architecture guesses.


======================================================================
16. SOFTWARE ARCHITECTURE SNIPPET OUTPUT
======================================================================

Inspect the EXISTING Snippetor snippet model before designing anything
new.

The agent should produce a normal Snippetor artifact.

Conceptually, the output contains an ordered walkthrough:

    ArchitectureSnippet
        |
        +-- title
        |
        +-- description / goal
        |
        +-- walkthrough items
                |
                +-- Source Step
                |
                +-- Source Step
                |
                +-- UMLSync Diagram
                |
                +-- Source Step
                |
                +-- UMLSync Diagram
                |
                +-- ...


A source step conceptually contains:

    source reference
    +
    explanation


For example:

    Step 3

    Source:
    third_party/blink/renderer/modules/xr/xr_system.cc
    XRSystem::requestSession()

    Explanation:
    XRSystem validates the request and forwards session creation
    toward the browser-side XR service.


The exact schema MUST be based on existing Snippetor models.

Do not invent a new snippet format if one already exists.


======================================================================
17. DIAGRAMS ARE PART OF THE EXPLANATION
======================================================================

UMLSync diagrams complement the source walkthrough.

The agent should eventually be able to decide:

    "A diagram would make this architectural relationship easier
     to understand."


Examples:

A class diagram may help explain:

    inheritance / ownership relationships


A sequence diagram may help explain:

    JavaScript
        ↓
    Blink
        ↓
    Mojo
        ↓
    Browser process


A component diagram may help explain:

    renderer
        ↓
    Mojo interface
        ↓
    browser service


A snippet may contain MULTIPLE diagrams.

Example:

    Steps 1–4
        ↓
    sequence diagram showing request flow
        ↓
    Steps 5–8
        ↓
    component diagram showing process ownership


The diagrams should explain concepts that are difficult to understand
from individual source locations alone.

Do NOT generate diagrams merely because the feature supports them.


======================================================================
18. UMLSYNC INTEGRATION
======================================================================

Inspect existing UMLSync integration.

Determine:

- how diagrams are represented
- how diagram JSON is created
- supported diagram types
- how diagrams are stored in Snippetor
- how they are opened
- how they are edited
- how they participate in walkthrough ordering
- how they reference or relate to snippet content


IMPORTANT:

Do not create a second UML representation unless absolutely necessary.

Prefer native UMLSync JSON.


Separate responsibilities:

    Architecture Agent
        ↓
    decides WHAT should be shown

    UMLSync
        ↓
    represents / edits / renders the diagram


Where possible, layout should remain UMLSync's responsibility.


======================================================================
19. EXPLANATION QUALITY
======================================================================

The goal is NOT to dump every discovered symbol.

The final walkthrough should teach a developer how the code works.

The agent must distinguish:

IMPORTANT ARCHITECTURAL STEPS

from:

IMPLEMENTATION NOISE


For example, if the agent follows 40 functions while investigating a
feature, the final snippet may contain only 7 important source steps.

The exploration graph and the final explanation are NOT the same
thing.

This distinction should be reflected in the design:

    Exploration
        ↓
    lots of discovered information
        ↓
    architecture understanding
        ↓
    select important path
        ↓
    explanatory walkthrough


======================================================================
20. SOURCE EVIDENCE
======================================================================

Every walkthrough step should originate from source evidence discovered
during exploration.

Every important relationship should ideally retain provenance.

Conceptually:

    Relationship:
        XRSystem
            ↓
        XRService

    Evidence:
        xr_system.cc:...
        xr_service.mojom:...


This provenance can later help with:

- regenerating snippets
- updating snippets after source changes
- verifying AI explanations
- navigating from diagrams back to source
- explaining why the agent included something


Investigate how this fits existing Snippetor source references.


======================================================================
21. SOURCE VERSIONING
======================================================================

Snippetor already deals with version-controlled source.

Inspect existing behavior around:

- Git commit
- blob SHA
- tree SHA
- source URL
- source range


Determine how agent-generated walkthrough steps should reuse this
existing version information.

Do NOT redesign versioning unless necessary.

The final Architecture Snippet should point to stable source versions
where existing Snippetor infrastructure supports it.


======================================================================
22. FIRST VERTICAL SLICE
======================================================================

The first vertical slice should prove AGENTIC CODE EXPLORATION.

Do NOT start with automatic UML generation.

Suggested command:

    Snippetor: Explore Symbol with Agent


Workflow:

1. User places cursor on a C++ symbol.

2. Snippetor obtains semantic information about that symbol.

3. User gives a goal, or the default goal is:

       "Explain how this code works and identify the important
        surrounding architecture."

4. Agent explores using semantic tools.

Example:

    Goal:
    Explain XRSession

    [1]
    find_definition(XRSession)

    [2]
    get_type_hierarchy(XRSession)

    [3]
    get_document_symbols(xr_session.cc)

    [4]
    read_source(...)

    [5]
    find_references(...)

    [6]
    follow important related symbol

    [7]
    read_source(...)

    ...

5. Agent produces a DRAFT walkthrough:

    {
        title: "...",

        steps: [
            {
                source: ...,
                explanation: ...
            },
            ...
        ]
    }


6. Display/log the result.

The first vertical slice does NOT need to persist the snippet yet if
that adds unnecessary complexity.

The purpose is to prove:

    LLM
      ↓
    semantic navigation
      ↓
    iterative exploration
      ↓
    coherent source walkthrough


======================================================================
23. SECOND VERTICAL SLICE
======================================================================

Once exploration works:

Convert the draft into an actual existing Snippetor Software
Architecture Snippet.

Reuse existing:

- source reference model
- comments
- walkthrough ordering
- persistence


Goal:

    Agent exploration
        ↓
    real editable Snippetor artifact


======================================================================
24. THIRD VERTICAL SLICE
======================================================================

Add UMLSync.

The agent should analyze the walkthrough and determine whether a
diagram improves the explanation.

Start with ONE diagram type.

Choose the diagram type based on existing UMLSync capabilities and
the simplest meaningful architecture use case.

For example:

    class diagram

or:

    sequence diagram


Then:

    Architecture Snippet

    Step 1
    Step 2
    Step 3

    [generated editable UMLSync diagram]

    Step 4
    Step 5


The diagram must be editable using existing UMLSync functionality.


======================================================================
25. MULTIPLE DIAGRAMS
======================================================================

Design the architecture so a snippet can eventually contain multiple
diagrams.

Do NOT necessarily implement this in the first UML milestone.

But avoid assumptions such as:

    snippet.diagram

if the actual product concept is:

    snippet.walkthroughItems[]

where diagram items and source items can appear in sequence.


Check the existing Snippetor data model before proposing changes.


======================================================================
26. AGENT TRACE / OBSERVABILITY
======================================================================

This is REQUIRED for the MVP.

I want to see how the agent explores the codebase.

Reuse an existing Snippetor OutputChannel if possible.

Example:

    [Snippetor Architecture Agent]

    Goal:
    Explain how XRSession works

    [1] find_definition
        XRSession
        → xr_session.h

    [2] get_type_hierarchy
        → EventTarget
        → ExecutionContextLifecycleObserver

    [3] read_source
        xr_session.cc:120-180

    [4] find_references
        → 14 references

    [5] inspect
        XRSystem::requestSession

    [6] read_source
        xr_system.cc:...

    [7] discovered boundary
        renderer → Mojo

    [8] ...

    [FINAL]

        explored files: 8
        semantic tool calls: 17
        walkthrough steps: 6
        diagram candidates: 1


Do NOT expose hidden chain-of-thought.

Log only:

- goal
- tool calls
- tool results
- source locations
- discovered entities
- high-level progress
- errors
- timing
- token/context usage if available
- final output summary


======================================================================
27. CANCELLATION
======================================================================

The user must be able to stop exploration.

Integrate with VS Code CancellationToken where appropriate.

Cancellation should propagate through:

    UI command
        ↓
    AgentLoop
        ↓
    LLM request
        ↓
    tool execution
        ↓
    CodeIntelligence


Avoid orphaned background exploration.


======================================================================
28. TESTABILITY
======================================================================

Keep these layers independently testable:

    LLMProvider

    AgentLoop

    AgentTools

    CodeIntelligence

    Architecture/Snippet generation

    UMLSync integration


CodeIntelligence should be mockable.

LLMProvider should be mockable.

A deterministic fake LLM should allow testing sequences such as:

    find_definition
        ↓
    find_references
        ↓
    read_source
        ↓
    final walkthrough


Do not require a real LLM for basic AgentLoop tests.


======================================================================
29. MVP NON-GOALS
======================================================================

Explicitly DO NOT build yet:

- custom C++ AST parser
- custom Java parser
- custom Mojom parser
- custom whole-repository index
- vector database
- embeddings
- generic RAG infrastructure
- multi-agent system
- autonomous source editing
- cloud backend
- authentication
- long-term agent memory
- sophisticated chat UI
- diagram review agent
- automatic full-Chromium architecture extraction
- generalized knowledge graph infrastructure


Use existing VS Code semantic infrastructure first.


======================================================================
30. PREFERRED LAYERING
======================================================================

Aim for a small architecture roughly like:

                    LLMProvider
                         ↑
                         │
                     AgentLoop
                         │
                         ↓
                     AgentTools
                         │
                         ↓
                  CodeIntelligence
                         │
                         ↓
                    VS Code API
                         │
          ┌──────────────┼───────────────┐
          ↓              ↓               ↓
       clangd      ChromiumIDE       Mojom LS
          │              │               │
          └──────────────┼───────────────┘
                         ↓
                ArchitectureKnowledge
                         ↓
                Walkthrough Builder
                         ↓
              Architecture Snippet
                         │
                ┌────────┴────────┐
                ↓                 ↓
           Source Steps       UMLSync
                              Diagram(s)


This is conceptual.

Do NOT force this structure if the existing repository suggests a
simpler architecture.


======================================================================
31. IMPLEMENTATION PHILOSOPHY
======================================================================

Be conservative.

I do NOT want an enterprise agent framework.

I want to understand the agentic loop and keep it under our control.

Prefer:

- simple TypeScript
- small interfaces
- existing VS Code APIs
- existing Snippetor models
- existing UMLSync models
- explicit state
- observable behavior

over:

- large frameworks
- unnecessary abstractions
- generic AI infrastructure
- premature scalability work


======================================================================
32. REQUIRED DELIVERABLE
======================================================================

DO NOT IMPLEMENT CODE.

Produce a planning document containing:

1. Existing Snippetor architecture relevant to this feature.

2. Existing Software Architecture Snippet data model.

3. Existing source-reference/version model.

4. Existing UMLSync integration.

5. Existing AI/context/MCP/skills functionality that can be reused.

6. Proposed agent architecture.

7. Proposed CodeIntelligence abstraction.

8. Exact mapping from CodeIntelligence operations to VS Code APIs.

9. Google.cros-ide / ChromiumIDE integration analysis.

10. Mojom language-provider analysis.

11. Proposed AgentTool abstraction.

12. Proposed SymbolRef / SourceRef strategy.

13. Proposed LLMProvider abstraction.

14. Proposed AgentState.

15. Agent Knowledge vs Active LLM Context strategy.

16. AgentLoop pseudocode.

17. ArchitectureKnowledge / exploration-state proposal, if needed.

18. How source evidence/provenance should be retained.

19. How the existing Snippetor walkthrough model should be populated.

20. How UMLSync diagrams should complement source steps.

21. How multiple diagrams should eventually fit into one walkthrough.

22. Cancellation/error strategy.

23. Observability/debugging strategy.

24. Testing strategy.

25. First vertical slice:
        semantic exploration → draft walkthrough

26. Second vertical slice:
        draft walkthrough → real Snippetor artifact

27. Third vertical slice:
        Snippetor walkthrough + editable UMLSync diagram

28. Future cross-language Chromium extensions.

29. Risks and unknowns discovered from the actual repository.

30. Explicit list of things that should NOT be implemented yet.

31. Proposed files to add.

32. Existing files to modify.

33. Step-by-step implementation order.

34. Rough implementation complexity for each step:
        SMALL / MEDIUM / LARGE

35. Dependencies between steps.


For EVERY proposed change, reference actual existing:

- files
- classes
- interfaces
- functions

from this repository.

If an existing abstraction can be reused, prefer it.

If you discover that an assumption in this prompt is wrong based on
the actual repository, explicitly call it out and propose the simpler
or more appropriate alternative.

The final plan should be detailed enough that we can review it,
adjust the architecture, and then hand individual implementation
steps back to Claude Code one at a time.