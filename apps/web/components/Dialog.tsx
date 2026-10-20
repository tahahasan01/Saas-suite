"use client";

import * as R from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useRef } from "react";
import { cx } from "@/components/ui";
import { openerElement } from "@/components/shell/useFocusReturn";

/* Every overlay in the app goes through these two, so each one gets the same
 * guarantees: it sits above the sticky top bar (see the z-scale in
 * globals.css), fits the screen and scrolls inside itself, closes on Escape
 * and on its labelled ✕, keeps Tab inside, locks the page behind it, and hands
 * focus back when it closes. Radix supplies the behaviour; the look is ours. */

type Common = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Always required — it's what a screen reader announces. Hide it visually
   *  with `hideTitle` when the body already shows a heading. */
  title: string;
  hideTitle?: boolean;
  description?: string;
  children: React.ReactNode;
  /** Sticks to the bottom of the panel, outside the scrolling body, so the
   *  primary action is always reachable on a short screen. */
  footer?: React.ReactNode;
  /** Where focus goes when it closes. Default: back to whatever opened it;
   *  call e.preventDefault() and focus something yourself to override. */
  onCloseAutoFocus?: (e: Event) => void;
  onOpenAutoFocus?: (e: Event) => void;
  /** false: a click outside doesn't close it (half-filled forms). Escape and ✕ still do. */
  dismissible?: boolean;
  className?: string;
};

/** Radix returns focus only to its own <Trigger>; ours open from plain buttons,
 *  so on close focus fell to <body> and a keyboard user restarted at the top
 *  of the page. Remember the opener and hand focus back to it — unless the
 *  caller's own onCloseAutoFocus already sent it somewhere (the till sends it
 *  to the scan field) by calling preventDefault. */
function useOpenerFocus(onOpen?: (e: Event) => void, onClose?: (e: Event) => void) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (e: Event) => {
      // Runs before Radix moves focus inside, so this is still the opener —
      // or, after a mouse/touch press in Safari (which leaves focus on
      // <body>), the control that was pressed.
      opener.current = openerElement();
      onOpen?.(e);
    },
    onCloseAutoFocus: (e: Event) => {
      onClose?.(e);
      const el = opener.current;
      opener.current = null;
      if (e.defaultPrevented) return;
      if (el && el.isConnected) { e.preventDefault(); el.focus(); }
    },
  };
}

const overlay = "fixed inset-0 z-[60] bg-black/50 data-[state=open]:animate-fade-in";

function Header({ title, hideTitle, description }: Pick<Common, "title" | "hideTitle" | "description">) {
  return (
    <div className={cx("flex items-start justify-between gap-3", hideTitle ? "absolute right-3 top-3" : "border-b border-line px-5 py-4")}>
      <div className={hideTitle ? "sr-only" : "min-w-0"}>
        <R.Title className="font-display text-lg font-semibold leading-snug">{title}</R.Title>
        {description && <R.Description className="mt-0.5 text-sm text-fg-muted">{description}</R.Description>}
      </div>
      <R.Close
        aria-label="Close"
        className="-mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-muted hover:bg-elevated hover:text-fg pointer-coarse:h-11 pointer-coarse:w-11"
      >
        <X size={18} aria-hidden />
      </R.Close>
    </div>
  );
}

/** Centred dialog on desktop; a bottom sheet on phones, where a centred box
 *  leaves the thumb far from the buttons. */
export function Dialog({ open, onOpenChange, title, hideTitle, description, children, footer, onCloseAutoFocus, onOpenAutoFocus, dismissible = true, className, size = "md" }:
  Common & { size?: "sm" | "md" | "lg" }) {
  const width = { sm: "sm:max-w-sm", md: "sm:max-w-lg", lg: "sm:max-w-2xl" }[size];
  const focus = useOpenerFocus(onOpenAutoFocus, onCloseAutoFocus);
  return (
    <R.Root open={open} onOpenChange={onOpenChange}>
      <R.Portal>
        <R.Overlay className={overlay} />
        <R.Content
          onCloseAutoFocus={focus.onCloseAutoFocus}
          onOpenAutoFocus={focus.onOpenAutoFocus}
          onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cx(
            "fixed z-[60] flex flex-col bg-surface shadow-2xl outline-none",
            "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
            "sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[calc(100vw-2rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:pb-0",
            width, className,
          )}
        >
          <Header title={title} hideTitle={hideTitle} description={description} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}

/** A panel from the edge: record details on the right, navigation on the left,
 *  a cart from the bottom. Full width on phones. */
export function Sheet({ open, onOpenChange, title, hideTitle, description, children, footer, onCloseAutoFocus, onOpenAutoFocus, dismissible = true, className, side = "right" }:
  Common & { side?: "right" | "left" | "bottom" }) {
  const place = {
    right: "inset-y-0 right-0 h-dvh w-full sm:max-w-md",
    left: "inset-y-0 left-0 h-dvh w-[min(85vw,280px)]",
    bottom: "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]",
  }[side];
  const focus = useOpenerFocus(onOpenAutoFocus, onCloseAutoFocus);
  return (
    <R.Root open={open} onOpenChange={onOpenChange}>
      <R.Portal>
        <R.Overlay className={overlay} />
        <R.Content
          onCloseAutoFocus={focus.onCloseAutoFocus}
          onOpenAutoFocus={focus.onOpenAutoFocus}
          onInteractOutside={dismissible ? undefined : (e) => e.preventDefault()}
          {...(description ? {} : { "aria-describedby": undefined })}
          className={cx("fixed z-[60] flex flex-col bg-surface shadow-2xl outline-none", place, className)}
        >
          <Header title={title} hideTitle={hideTitle} description={description} />
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </R.Content>
      </R.Portal>
    </R.Root>
  );
}
