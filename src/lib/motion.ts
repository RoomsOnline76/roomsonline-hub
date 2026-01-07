// Animation configuration for consistent motion across the app
// Based on "Paris Fashion Week" design brief

export const timing = {
  micro: 150,
  default: 200,
  slow: 300,
  page: 200,
} as const;

export const easing = {
  default: [0.4, 0, 0.2, 1],
  easeOut: [0, 0, 0.2, 1],
  easeIn: [0.4, 0, 1, 1],
  spring: [0.175, 0.885, 0.32, 1.275],
} as const;

// Framer Motion variants
export const fadeIn = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: timing.default / 1000 },
};

export const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: { duration: timing.default / 1000, ease: easing.easeOut },
};

export const fadeInDown = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: timing.default / 1000, ease: easing.easeOut },
};

export const scaleIn = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: timing.default / 1000, ease: easing.easeOut },
};

export const slideInRight = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
  transition: { duration: timing.slow / 1000, ease: easing.easeOut },
};

export const slideInLeft = {
  initial: { x: "-100%" },
  animate: { x: 0 },
  exit: { x: "-100%" },
  transition: { duration: timing.slow / 1000, ease: easing.easeOut },
};

// Page transition wrapper
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: timing.page / 1000, ease: easing.easeOut },
};

// Stagger children animation
export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: timing.default / 1000, ease: easing.easeOut },
};

// Card hover effect
export const cardHover = {
  rest: {
    y: 0,
    boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
  },
  hover: {
    y: -2,
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
    transition: { duration: timing.micro / 1000, ease: easing.easeOut },
  },
};

// Skeleton shimmer
export const shimmer = {
  animate: {
    backgroundPosition: ["200% 0", "-200% 0"],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "linear",
    },
  },
};

// List item variants for stagger
export const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
    },
  },
};

export const listItemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { 
    opacity: 1, 
    x: 0,
    transition: { duration: timing.default / 1000, ease: easing.easeOut },
  },
};

// Toast animation
export const toastAnimation = {
  initial: { opacity: 0, x: 50, scale: 0.95 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: 50, scale: 0.95 },
  transition: { duration: timing.default / 1000, ease: easing.spring },
};

// Modal/Dialog animation
export const modalAnimation = {
  overlay: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: timing.default / 1000 },
  },
  content: {
    initial: { opacity: 0, scale: 0.95, y: 10 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.95, y: 10 },
    transition: { duration: timing.default / 1000, ease: easing.spring },
  },
};

// Utility: Create transition string for CSS
export function createTransition(
  properties: string[],
  duration: number = timing.default,
  easingType: keyof typeof easing = "default"
): string {
  return properties
    .map((prop) => `${prop} ${duration}ms cubic-bezier(${easing[easingType].join(", ")})`)
    .join(", ");
}

// Utility: Reduced motion check
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Get animation props respecting reduced motion
export function getAnimationProps<T extends object>(props: T): T | {} {
  if (prefersReducedMotion()) {
    return {};
  }
  return props;
}
