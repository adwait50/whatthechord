import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware()

export const config = {
  matcher: [
    // This pattern means: run on ALL routes EXCEPT
    // static files like images, fonts, css, js etc
    // The (?!_next) part skips Next.js internal routes
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    
    // Also run on all API routes
    "/(api|trpc)(.*)",
  ],
}