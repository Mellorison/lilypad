import { DataTable } from "@/components/DataTable";
import LilypadDialog from "@/components/LilypadDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmojiPicker, EmojiPickerContent } from "@/components/ui/emoji-picker";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Typography } from "@/components/ui/typography";
import { useFeatureAccess } from "@/hooks/use-featureaccess";
import { AnnotationPublic, Scope, SpanPublic, TagPublic } from "@/types/types";
import { fetchCommentsBySpan } from "@/utils/comments";
import { fetchSpan, useDeleteSpanMutation } from "@/utils/spans";
import { formatDate } from "@/utils/strings";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ColumnDef, FilterFn, Row } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Filter,
  MoreHorizontal,
  NotebookPen,
  SmileIcon,
} from "lucide-react";
import { Dispatch, SetStateAction, useRef, useState } from "react";
import { toast } from "sonner";

const tagFilter = (
  row: Row<SpanPublic>,
  columnId: string,
  filterValue: string
): boolean => {
  const tags: TagPublic[] = row.getValue(columnId);

  if (!filterValue || filterValue.trim() === "") {
    return true;
  }
  if (!Array.isArray(tags) || tags.length === 0) {
    return false;
  }

  // Convert filter value to lowercase for case-insensitive comparison
  const filterLower = filterValue.toLowerCase();

  // Check if any tag name includes the filter value
  return tags.some((tag) => tag.name.toLowerCase().includes(filterLower));
};

// Custom filter function
const onlyParentFilter: FilterFn<SpanPublic> = (row, columnId, filterValue) => {
  const isParent =
    row.original.child_spans && row.original.child_spans.length > 0;

  if (isParent) {
    const cellValue = row.getValue(columnId);
    return String(cellValue)
      .toLowerCase()
      .includes(String(filterValue).toLowerCase());
  }

  // Always include child rows
  return true;
};

const Spacer = () => <div className="w-4 h-4" />;
const ExpandRowButton = ({ row }: { row: Row<SpanPublic> }) => {
  return (
    <ChevronRight
      onClick={(event) => {
        row.toggleExpanded();
        event.stopPropagation();
      }}
      className={`h-4 w-4 transition-transform ${
        row.getIsExpanded() ? "rotate-90" : ""
      }`}
    />
  );
};

interface TracesTableProps {
  data?: SpanPublic[];
  traceUuid?: string;
  projectUuid: string;
  /** true while useInfiniteQuery is fetching next page */
  isFetchingNextPage?: boolean;
  isSearch: boolean;
  order: "asc" | "desc";
  onOrderChange: (
    o: "asc" | "desc",
    order_by_column: "version" | "created_at"
  ) => void;
  fetchNextPage?: () => void;
  filterColumn?: string;
  /** Optional prop to access compare view state */
  onCompareViewToggle?: (isComparing: boolean) => void;
  className?: string;
}

export const TracesTable = ({
  data = [],
  traceUuid,
  projectUuid,
  isFetchingNextPage = false,
  isSearch = false,
  order,
  onOrderChange,
  fetchNextPage,
  filterColumn,
  className,
}: TracesTableProps) => {
  const navigate = useNavigate();
  const features = useFeatureAccess();
  const queryClient = useQueryClient();
  const virtualizerRef = useRef<HTMLDivElement>(null);
  const [deleteSpan, setDeleteSpan] = useState<string | null>(null);
  const [tagFilterOpen, setTagFilterOpen] = useState<boolean>(false);

  const findRow = (rows: SpanPublic[], uuid?: string) =>
    rows.find((r) => r.uuid === uuid) ??
    rows.flatMap((r) => r.child_spans ?? []).find((r) => r.uuid === uuid);
  const selectRow = findRow(data, traceUuid);
  const isSubRow = selectRow?.parent_span_id;

  const prefetch = (row: SpanPublic) => {
    queryClient
      .prefetchQuery({
        queryKey: ["spans", row.uuid],
        queryFn: () => fetchSpan(row.uuid),
        staleTime: 60000,
      })
      .catch(() => toast.error("Failed to prefetch"));
    queryClient
      .prefetchQuery({
        queryKey: ["spans", row.uuid, "comments"],
        queryFn: () => fetchCommentsBySpan(row.uuid),
        staleTime: 60000,
      })
      .catch(() => toast.error("Failed to prefetch"));
  };

  const columns: ColumnDef<SpanPublic>[] = [
    {
      accessorKey: "display_name",
      enableHiding: false,
      filterFn: onlyParentFilter,
      size: 250,
      header: ({ table }) => {
        return (
          <div className="flex items-center gap-2">
            <Spacer />
            <Checkbox
              checked={
                table.getIsAllPageRowsSelected() ||
                (table.getIsSomePageRowsSelected() && "indeterminate")
              }
              onCheckedChange={(value) =>
                table.toggleAllPageRowsSelected(!!value)
              }
              aria-label="Select all"
              className="mr-2"
            />
            Name
          </div>
        );
      },
      cell: ({ row }) => {
        const depth = row.depth;
        const hasSubRows = row.subRows.length > 0;
        const isSelected = row.getIsSelected();
        const displayName: string = row.getValue("display_name");
        return (
          <div style={{ marginLeft: `${depth * 1.5}rem` }} className="w-full">
            <div className="flex items-center gap-2">
              {hasSubRows ? <ExpandRowButton row={row} /> : <Spacer />}
              <Checkbox
                onClick={(e) => e.stopPropagation()}
                checked={isSelected}
                onCheckedChange={(checked) =>
                  row.toggleSelected(!!checked, {
                    selectChildren: false,
                  })
                }
                aria-label={`Select ${displayName}`}
                className="mr-2"
              />
              <span className="truncate">{displayName}</span>
            </div>
          </div>
        );
      },
    },
    ...(isSearch
      ? ([
          {
            accessorKey: "score",
            id: "score",
            size: 100,
            header: ({ column }) => {
              return (
                <Button
                  className="p-0"
                  variant="ghost"
                  onClick={() =>
                    column.toggleSorting(column.getIsSorted() === "asc")
                  }
                >
                  Score
                  {column.getIsSorted() ? (
                    column.getIsSorted() === "asc" ? (
                      <ArrowUp className="ml-2 h-4 w-4" />
                    ) : (
                      <ArrowDown className="ml-2 h-4 w-4" />
                    )
                  ) : (
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  )}
                </Button>
              );
            },
            cell: ({ row }) => {
              const score: number = row.getValue("score");
              return (
                <Typography variant="span" affects="xs" className="truncate">
                  {score?.toFixed(2)}
                </Typography>
              );
            },
          },
        ] as ColumnDef<SpanPublic>[])
      : []),
    {
      accessorKey: "scope",
      header: "Scope",
      size: 100,
    },
    {
      accessorKey: "tags",
      header: ({ table }) => {
        return (
          <div className="flex items-center gap-1">
            <Popover open={tagFilterOpen} onOpenChange={setTagFilterOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-8 ml-1"
                  title="Filter tags"
                >
                  Tags
                  <Filter
                    className={`w-4 h-4 ${
                      table.getColumn("tags")?.getFilterValue()
                        ? "text-primary"
                        : "text-muted-foreground"
                    }`}
                  />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-2 w-80">
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      placeholder="Filter tags..."
                      value={
                        (table.getColumn("tags")?.getFilterValue() as string) ??
                        ""
                      }
                      onChange={(event) => {
                        table
                          .getColumn("tags")
                          ?.setFilterValue(event.target.value);
                      }}
                      className="pr-10"
                    />
                    <Popover>
                      <PopoverTrigger asChild>
                        <SmileIcon className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer h-5 w-5 opacity-70 hover:opacity-100" />
                      </PopoverTrigger>
                      <PopoverContent className="w-fit p-0">
                        <EmojiPicker
                          className="h-[342px]"
                          onEmojiSelect={(emojiData) => {
                            const currFilter =
                              (table
                                .getColumn("tags")
                                ?.getFilterValue() as string) ?? "";
                            table
                              .getColumn("tags")
                              ?.setFilterValue(currFilter + emojiData.emoji);
                          }}
                        >
                          <EmojiPickerContent />
                        </EmojiPicker>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      },
      id: "tags",
      size: 150,
      filterFn: tagFilter,
      cell: ({ row }) => {
        const tags: TagPublic[] = row.getValue("tags");

        if (!Array.isArray(tags) || tags.length === 0) {
          return null;
        }

        return (
          <div className="flex items-center gap-1">
            <Badge variant="neutral" size="sm" key={tags[0].uuid}>
              {tags[0].name}
            </Badge>
            {tags.length > 1 && (
              <Badge variant="neutral" size="sm" className="px-1.5">
                +{tags.length - 1}
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      accessorFn: (row) => row.function?.version_num ?? null,
      id: "version",
      size: 100,
      meta: { sortUndefined: -1 },
      header: ({ table }) => {
        const isAsc = order === "asc";
        return (
          <Button
            className="p-0"
            variant="ghost"
            onClick={() => {
              const next = isAsc ? "desc" : "asc";
              onOrderChange(next, "version");
              table.setSorting([{ id: "version", desc: next === "desc" }]);
            }}
          >
            Version
            {isAsc ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : (
              <ArrowDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
    },
    {
      accessorKey: "status",
      id: "status",
      header: "Status",
      size: 100,
      cell: ({ row }) => {
        const status: string = row.getValue("status");
        if (status === "UNSET") return null;
        else if (status === "ERROR") {
          return (
            <Badge variant="destructive" size="sm">
              {status}
            </Badge>
          );
        } else return <Badge size="sm">{status}</Badge>;
      },
    },
    {
      accessorKey: "created_at",
      id: "timestamp",
      size: 200,
      header: ({ table }) => {
        const isAsc = order === "asc";
        return (
          <Button
            className="p-0"
            variant="ghost"
            onClick={() => {
              const next = isAsc ? "desc" : "asc";
              onOrderChange(next, "created_at");
              table.setSorting([{ id: "timestamp", desc: next === "desc" }]);
            }}
          >
            Timestamp
            {isAsc ? (
              <ArrowUp className="ml-2 h-4 w-4" />
            ) : (
              <ArrowDown className="ml-2 h-4 w-4" />
            )}
          </Button>
        );
      },
      cell: ({ row }) => {
        return (
          <Typography variant="span" affects="xs" className="truncate">
            {formatDate(row.getValue("timestamp"))}
          </Typography>
        );
      },
    },
    {
      accessorKey: "annotations",
      size: 100,
      header: ({ table }) => {
        const isFiltered = !!table.getColumn("annotations")?.getFilterValue();

        return (
          <div className="flex items-center">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="p-0 h-8"
                  onClick={() => {
                    table
                      .getColumn("annotations")
                      ?.setFilterValue(isFiltered ? undefined : true);
                  }}
                  title={
                    isFiltered ? "Show all rows" : "Show only annotated rows"
                  }
                >
                  <NotebookPen
                    className={`w-4 h-4 mr-2 ${isFiltered ? "text-primary" : "text-muted-foreground"}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Annotations</TooltipContent>
            </Tooltip>
          </div>
        );
      },
      cell: ({ row }) => {
        const annotations: AnnotationPublic[] =
          row.getValue("annotations") ?? [];
        const filteredAnnotations = annotations.filter(
          (annotation) => annotation.label
        );
        if (filteredAnnotations.length > 0) {
          return <NotebookPen className="w-4 h-4" />;
        }
        return null;
      },
      filterFn: (row, id, filterValue) => {
        // If no filter value is set, show all rows
        if (filterValue === undefined) return true;

        // If filter is applied, only show rows with annotations
        const annotations: AnnotationPublic[] = row.getValue(id);
        return annotations.length > 0;
      },
    },
    {
      id: "actions",
      size: 50,
      enableHiding: false,
      cell: ({ row }) => {
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              {row.original.scope === Scope.LILYPAD &&
                row.original.function?.is_versioned &&
                features.playground && (
                  <DropdownMenuItem
                    onClick={() => {
                      const { project_uuid, function: fn } = row.original;
                      if (!fn) return;
                      navigate({
                        to: `/projects/${project_uuid}/functions/${fn.name}/${fn.uuid}/overview`,
                      }).catch(() => {
                        toast.error("Failed to navigate");
                      });
                    }}
                  >
                    Open Playground
                  </DropdownMenuItem>
                )}
              <DropdownMenuSeparator />
              <DropdownMenuItem>View more details</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const getRowCanExpand = (row: SpanPublic) =>
    Array.isArray(row.child_spans) && row.child_spans.length > 0;
  const getSubRows = (row: SpanPublic) => row.child_spans || [];

  return (
    <>
      <DataTable<SpanPublic>
        className={className}
        columns={columns}
        data={data}
        virtualizerRef={virtualizerRef}
        virtualizerOptions={{
          count: data.length,
          estimateSize: () => 45,
          overscan: 20,
        }}
        onRowHover={prefetch}
        customExpanded={isSubRow ? { [isSubRow]: true } : undefined}
        customGetRowId={(row) => row.span_id}
        filterColumn={filterColumn}
        getRowCanExpand={getRowCanExpand}
        getSubRows={getSubRows}
        defaultSorting={
          isSearch
            ? [{ id: "score", desc: true }]
            : [{ id: "timestamp", desc: true }]
        }
        isFetching={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
        columnVisibilityStateKey="tracesTableVisibilityState"
      />
      {deleteSpan && (
        <DeleteSpanDialog
          setOpen={setDeleteSpan}
          spanUuid={deleteSpan}
          projectUuid={projectUuid}
        />
      )}
    </>
  );
};

interface DeleteSpanDialogProps {
  projectUuid: string;
  spanUuid: string;
  setOpen: Dispatch<SetStateAction<string | null>>;
}

const DeleteSpanDialog = ({
  projectUuid,
  spanUuid,
  setOpen,
}: DeleteSpanDialogProps) => {
  const deleteSpanMutation = useDeleteSpanMutation();
  const handleSpanDelete = async () => {
    await deleteSpanMutation
      .mutateAsync({
        projectUuid,
        spanUuid,
      })
      .catch(() => toast.error("Failed to delete span"));
    toast.success("Span deleted successfully");
    setOpen(null);
  };
  return (
    <LilypadDialog
      open={Boolean(spanUuid)}
      onOpenChange={() => setOpen(null)}
      noTrigger
      title={"Delete Span"}
      description={"Are you sure you want to delete this span?"}
    >
      <DialogFooter>
        <Button key="submit" onClick={handleSpanDelete} className="w-full">
          Delete Span
        </Button>
      </DialogFooter>
    </LilypadDialog>
  );
};
