/**
 * Site mark: uses uploaded brand asset from /public/logo.png for sharp rendering at UI sizes.
 */
export default function BrandLogo({ className = "" }) {
  return (
    <img
      src="/logo.png"
      alt=""
      width={64}
      height={64}
      className={["brand-logo", className].filter(Boolean).join(" ")}
      decoding="async"
    />
  );
}
