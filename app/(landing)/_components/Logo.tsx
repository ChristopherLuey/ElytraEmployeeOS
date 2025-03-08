import { Poppins } from "next/font/google";
import { cn } from "@/lib/utils";
import Image from "next/image";

const font = Poppins({
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const Logo = () => {
  return (
    <div className="flex items-center gap-x-2">
      <Image
        src="/ElytraLogo.svg"
        height="40"
        width="40"
        alt="logo"
        className="dark:hidden"
      />
      <Image
        src="/ElytraLogo.svg"
        height="40"
        width="40"
        alt="logo"
        className="hidden dark:block"
      />
      <p className={cn(font.className)}>Elytra Robotics</p>
    </div>
  );
};
