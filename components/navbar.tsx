"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { Guitar } from "lucide-react";
import { cn } from "@/lib/utils";
const navLinks = [{ href: "/api/songs", label: "Browse" }];

export function Navbar() {
  const pathname = usePathname();

  const { isSignedIn } = useUser();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm">
      {}
      {}
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        {}
        {}
        <Link href="/" className="flex items-center gap-2 group">
          {}
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center group-hover:bg-amber-400 transition-colors">
            <Guitar className="w-5 h-5 text-black" />
          </div>
          {}
          <span className="font-bold text-lg tracking-tight">
            WhatThe<span className="text-amber-500">Chord</span>
          </span>
        </Link>

        {}
        {}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors hover:text-amber-500",

                pathname === link.href
                  ? "text-amber-500"
                  : "text-muted-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {}
        <div className="flex items-center gap-3">
          {isSignedIn ? (
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-8 h-8",
                },
              }}
            />
          ) : (
            <>
              {}
              <SignInButton mode="modal">
                <button className="text-sm font-medium text-muted-foreground hover:text-white transition-colors">
                  Sign in
                </button>
              </SignInButton>

              {}
              <SignUpButton mode="modal">
                <button className="text-sm font-medium bg-amber-500 hover:bg-amber-400 text-black px-4 py-1.5 rounded-lg transition-colors">
                  Sign up
                </button>
              </SignUpButton>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
