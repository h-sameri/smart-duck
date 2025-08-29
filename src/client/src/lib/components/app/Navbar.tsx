import { Link, useLocation } from "@tanstack/react-router";
import { Image } from "../custom/Image";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { Menu } from "lucide-react";
import type { ReactNode } from "react";

interface NavbarProps {
  mobileMenuContent?: ReactNode;
}

export default function Navbar({ mobileMenuContent }: NavbarProps) {
  const location = useLocation();

  return (
    <nav className="fixed top-0 gap-2 h-[var(--navbar-height)] w-full z-50 border-b bg-background flex items-center justify-between px-4">
      {/* top left */}
      <Link to="/" className="flex gap-2 items-center">
  <Image src="/static/images/logo.png" alt="Smart Duck" className="size-12" />
  <span className="text-3xl tracking-tight font-semibold text-primary">smart duck</span>
      </Link>

      <div className="flex gap-3 items-center">
        <Button variant="primary" asChild>
          <a href="https://t.me/smart_duckchain_bot" target="_blank" rel="noopener">
            Telegram Bot
          </a>
        </Button>

        {mobileMenuContent && (
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="secondary" size="icon" className="border">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-80 p-0">
                {mobileMenuContent}
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>
    </nav>
  )
}