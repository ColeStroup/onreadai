import Image from "next/image";

import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  size?: number;
  alt?: string;
  eager?: boolean;
  className?: string;
};

export function BrandLogo({
  size = 36,
  alt = "",
  eager = false,
  className,
}: BrandLogoProps) {
  return (
    <Image
      src={brand.logoPath}
      alt={alt}
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
      className={cn(
        "aspect-square shrink-0 rounded-lg object-cover",
        className,
      )}
      data-onread-logo
    />
  );
}
