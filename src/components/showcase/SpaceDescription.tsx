import { motion } from "framer-motion";

interface SpaceDescriptionProps {
  spaceDescription?: string | null;
  keyHighlights?: string[] | null;
}

export function SpaceDescription({ spaceDescription, keyHighlights }: SpaceDescriptionProps) {
  if (!spaceDescription && (!keyHighlights || keyHighlights.length === 0)) return null;

  // Split content into paragraphs
  const paragraphs = spaceDescription ? spaceDescription.split(/\n\n|\n/).filter((p: string) => p.trim().length > 0) : [];

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.6 }}
      className="py-8 sm:py-10 border-t border-border/40"
    >
      <h2 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight mb-4">
        The space
      </h2>

      {/* Key Highlights as pills */}
      {keyHighlights && keyHighlights.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {keyHighlights.map((highlight, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
              {highlight}
            </span>
          ))}
        </div>
      )}

      {/* Prose content */}
      {paragraphs.length > 0 && (
        <div className="space-y-3 max-w-prose">
          {paragraphs.map((para, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed">
              {para.trim()}
            </p>
          ))}
        </div>
      )}
    </motion.section>
  );
}
