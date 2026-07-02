/**
 * Demo placeholder from the original design spec - this footage belongs to
 * a different, unrelated product. Fine for a demo per explicit direction;
 * swap for a real Zamance-branded clip before any real launch by setting
 * NEXT_PUBLIC_HERO_VIDEO_URL, which overrides this default.
 */
const DEMO_VIDEO_URL =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260606_131516_eca35265-ea66-4fbd-8d52-22aae6e1a503.mp4";

export function HeroBackground() {
  const videoUrl = process.env.NEXT_PUBLIC_HERO_VIDEO_URL || DEMO_VIDEO_URL;

  return (
    <div className="absolute inset-0 z-0 h-full w-full overflow-hidden">
      <video
        className="absolute inset-0 z-0 h-full w-full object-cover"
        src={videoUrl}
        autoPlay
        muted
        loop
        playsInline
      />
    </div>
  );
}
