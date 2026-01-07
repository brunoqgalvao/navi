<script lang="ts">
  import type { KanbanCard as KanbanCardType, KanbanStatus, KanbanColumn as KanbanColumnType } from "../types";
  import KanbanColumn from "./KanbanColumn.svelte";

  interface Props {
    columns: (KanbanColumnType & { cards: KanbanCardType[] })[];
    onAddCard?: (status: KanbanStatus, title: string) => void;
    onEditCard?: (card: KanbanCardType) => void;
    onDispatchCard?: (card: KanbanCardType) => void;
    onStatusChange?: (card: KanbanCardType, status: KanbanStatus) => void;
    onMoveNext?: (card: KanbanCardType) => void;
    onDeleteCard?: (card: KanbanCardType) => void;
    onNavigateToSession?: (sessionId: string) => void;
  }

  let {
    columns,
    onAddCard,
    onEditCard,
    onDispatchCard,
    onStatusChange,
    onMoveNext,
    onDeleteCard,
    onNavigateToSession,
  }: Props = $props();

  function handleDropCard(cardId: string, toStatus: KanbanStatus) {
    for (const col of columns) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card && card.status !== toStatus) {
        onStatusChange?.(card, toStatus);
        break;
      }
    }
  }
</script>

<div class="flex gap-6 overflow-x-auto pb-4 h-full px-2">
  {#each columns as column (column.id)}
    <KanbanColumn
      {column}
      cards={column.cards}
      {onAddCard}
      onEditCard={onEditCard}
      onDispatchCard={onDispatchCard}
      {onMoveNext}
      onDeleteCard={onDeleteCard}
      {onNavigateToSession}
      onDropCard={handleDropCard}
    />
  {/each}
</div>
