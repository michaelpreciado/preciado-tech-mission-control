# W2-N — terminal chat skin

## Audit

- ChatConsole: `cc-bubble` / `cc-bubble-head` wrapped markdown and collapsible tools; `cc-composer` contained the textarea and send button. `cc-thread-head` names the thread; `cc-thread` owns scrolling, bottom refs and jump-to-latest. Conversation list filtering and keyboard navigation live outside message frames.
- HomeChat: HomeWorkspace.module.css supplied rounded `.user` bubbles, speaker labels, a filled `.inputBox` and arrow send control. `.chatHeader` uses W2-K SectionRule; `.messages` owns follow-scroll. The composer moves between welcome and active states.
- LiveChatMirror: globals.css supplies `mcl-*` headers, session controls and expanded thread layout; messages reused console bubbles. Polling and thread refs remain intact.
- ChatIntel (components/views/ChatIntel.tsx): no chat messages; its Panel helper wrapped heatmap, ranking and source panels. Existing chart and click-through contents remain intact.
- AgentDeck: detail dialog output was a rounded scrolling pre. The existing bridge already strips ANSI/control characters before returning tail text.
- KanbanBoard: DetailDrawer body holds metadata, brief, actions, comments, runs and events. Only that body receives the frame; board, create modal and drawer controls retain their existing structure and behavior.
- Reviewed globals.css chat/Intel/mirror rules, HomeWorkspace and AgentDeck CSS modules, and v3-lane's additive specificity pattern. Shared styles and app/vf files are unchanged.

## Frame design

`components/ascii-msg.tsx` exports AsciiMsg with who, side, ts and idx props, optional compact size and header actions. Square one-pixel frames use a ruled top edge and `┤ [SENDER] ├` header, right-aligned timestamp and zero-padded index. User frames indent from the left and use rgba(157,180,236,.85); agent frames align left at .55; full-width system frames are dashed at .30. Fill is only rgba(157,180,236,.04). JetBrains Mono uses the existing Next/font variable. Body markdown, code selection, copying and tool expansion are preserved; no per-character text transformations.

Shared CSS lives exclusively in the new components/ascii-msg.css, using amsg-/aprompt- names. Message rendering retains content-visibility optimization. Compact frames serve HomeChat and mirror; panel/output/task variants share the same header and border system. Existing outer chat containers get square corners without changing their fills.

HomeChat records timestamps for new messages. Older stored messages show a dash rather than an invented time. Other messages retain their source timestamps; indexes follow displayed thread order.

## Prompt design

Both chat composers use the same `┃ >` gutter and `[ SEND ]` chip. The gutter brightens on focus within. An aria-hidden block blinks only for an empty draft; reduced-motion makes it static. Existing textarea refs, labels, limits, disabled conditions, submit/key handlers and focus behavior remain. Busy agent output uses static ellipsis instead of the boot cursor.

## Applied surfaces

Console messages/tools/system records and pending reply; HomeChat messages, notices and pending state; expanded live mirror messages; all Intel Panel instances; AgentDeck terminal tail with [AGENT]; Kanban detail body with [TASK]. W2-K SectionRule remains in place. No dependencies or API, token, collector, 3D, boot or page-layout changes.

## Validation

- `npx tsc --noEmit`: passed.
- `npm run build`: passed on final code. Non-fatal warnings concern workspace lockfiles, deprecated middleware naming, broad file tracing and experimental SQLite.
- `git diff --check`: passed.
- No browser interaction validation was performed; send/scroll/focus behavior was preserved by retaining existing handlers and refs.
