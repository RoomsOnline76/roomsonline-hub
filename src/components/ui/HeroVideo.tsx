import { isYouTubeUrl, extractYouTubeId, getYouTubeEmbedUrl } from "@/utils/videoUtils";

interface HeroVideoProps {
  src: string;
  autoPlay?: boolean;
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  poster?: string;
  className?: string;
}

/**
 * Renders either a native <video> or a YouTube <iframe> depending on the URL.
 */
export function HeroVideo({
  src,
  autoPlay = false,
  loop = false,
  muted = true,
  controls = false,
  poster,
  className = "",
}: HeroVideoProps) {
  const youtubeId = extractYouTubeId(src);

  if (youtubeId) {
    const embedUrl = getYouTubeEmbedUrl(youtubeId, {
      autoplay: autoPlay,
      muted,
      loop,
      controls,
    });
    return (
      <iframe
        src={embedUrl}
        className={className}
        allow="autoplay; encrypted-media"
        allowFullScreen
        style={{ border: 0 }}
        title="Hero video"
      />
    );
  }

  return (
    <video
      src={src}
      autoPlay={autoPlay}
      loop={loop}
      muted={muted}
      playsInline
      controls={controls}
      poster={poster}
      className={className}
    />
  );
}
