import * as React from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

// ============ CardList Container ============
interface CardListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  loading?: boolean;
  loadingRows?: number;
}

const CardList = React.forwardRef<HTMLDivElement, CardListProps>(
  ({ className, children, loading, loadingRows = 5, ...props }, ref) => {
    if (loading) {
      return (
        <div ref={ref} className={cn("space-y-2", className)} {...props}>
          {Array.from({ length: loadingRows }).map((_, i) => (
            <CardListItemSkeleton key={i} />
          ))}
        </div>
      );
    }

    return (
      <div ref={ref} className={cn("space-y-2", className)} {...props}>
        {children}
      </div>
    );
  }
);
CardList.displayName = "CardList";

// ============ CardList Item ============
interface CardListItemProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  selected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  showCheckbox?: boolean;
  actions?: React.ReactNode;
}

const CardListItem = React.forwardRef<HTMLDivElement, CardListItemProps>(
  (
    { className, children, selected, onSelectChange, showCheckbox, actions, ...props },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "group relative rounded-lg border bg-card p-4 transition-all",
          "hover:shadow-sm hover:border-border/80",
          selected && "ring-2 ring-primary/20 border-primary/30",
          className
        )}
        {...props}
      >
        <div className="flex items-start gap-3">
          {showCheckbox && (
            <Checkbox
              checked={selected}
              onCheckedChange={onSelectChange}
              className="mt-1"
            />
          )}
          <div className="flex-1 min-w-0">{children}</div>
          {actions && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {actions}
            </div>
          )}
        </div>
      </div>
    );
  }
);
CardListItem.displayName = "CardListItem";

// ============ CardList Content ============
interface CardListContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const CardListContent = React.forwardRef<HTMLDivElement, CardListContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn("space-y-1", className)} {...props}>
        {children}
      </div>
    );
  }
);
CardListContent.displayName = "CardListContent";

// ============ CardList Title ============
interface CardListTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
}

const CardListTitle = React.forwardRef<HTMLHeadingElement, CardListTitleProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <h4
        ref={ref}
        className={cn("text-sm font-medium leading-none", className)}
        {...props}
      >
        {children}
      </h4>
    );
  }
);
CardListTitle.displayName = "CardListTitle";

// ============ CardList Description ============
interface CardListDescriptionProps
  extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

const CardListDescription = React.forwardRef<
  HTMLParagraphElement,
  CardListDescriptionProps
>(({ className, children, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn("text-xs text-muted-foreground", className)}
      {...props}
    >
      {children}
    </p>
  );
});
CardListDescription.displayName = "CardListDescription";

// ============ CardList Meta ============
interface CardListMetaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const CardListMeta = React.forwardRef<HTMLDivElement, CardListMetaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex items-center gap-3 text-xs text-muted-foreground mt-1",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
CardListMeta.displayName = "CardListMeta";

// ============ CardList Skeleton ============
function CardListItemSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
    </div>
  );
}

// ============ CardList Empty ============
interface CardListEmptyProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}

const CardListEmpty = React.forwardRef<HTMLDivElement, CardListEmptyProps>(
  (
    {
      className,
      icon,
      title = "No items",
      description,
      action,
      ...props
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex flex-col items-center justify-center py-12 text-center",
          className
        )}
        {...props}
      >
        {icon && (
          <div className="mb-4 text-muted-foreground/50">{icon}</div>
        )}
        <h3 className="font-serif text-lg font-medium text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            {description}
          </p>
        )}
        {action && <div className="mt-4">{action}</div>}
      </div>
    );
  }
);
CardListEmpty.displayName = "CardListEmpty";

export {
  CardList,
  CardListItem,
  CardListContent,
  CardListTitle,
  CardListDescription,
  CardListMeta,
  CardListEmpty,
  CardListItemSkeleton,
};
