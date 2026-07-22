import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col min-h-[100dvh] bg-zinc-950 text-zinc-50 selection:bg-zinc-800">
      <header className="px-4 lg:px-6 h-16 flex items-center border-b border-zinc-800">
        <Link className="flex items-center justify-center" href="/">
          <span className="font-bold text-xl tracking-tighter">ChatAgent</span>
        </Link>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          <Link className="text-sm font-medium hover:text-zinc-300 transition-colors" href="#">
            Features
          </Link>
          <Link className="text-sm font-medium hover:text-zinc-300 transition-colors" href="#">
            Pricing
          </Link>
          <Link className="text-sm font-medium hover:text-zinc-300 transition-colors" href="/settings">
            Settings
          </Link>
        </nav>
      </header>
      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 flex items-center justify-center">
          <div className="container px-4 md:px-6 text-center">
            <div className="space-y-4 max-w-3xl mx-auto">
              <h1 className="text-4xl font-extrabold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl/none bg-clip-text text-transparent bg-gradient-to-r from-zinc-200 to-zinc-500">
                Your AI Research & Chat Agent
              </h1>
              <p className="mx-auto max-w-[700px] text-zinc-400 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                ChatAgent provides instant, in-depth research and analysis powered by advanced LLM tools.
              </p>
              <div className="flex flex-wrap justify-center gap-4 mt-8">
                <Link 
                  href="/login" 
                  className={cn(buttonVariants({ size: "lg" }), "bg-zinc-50 text-zinc-950 hover:bg-zinc-200 font-semibold")}
                >
                  Get Started
                </Link>
                <Link 
                  href="/settings" 
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800 hover:text-white font-semibold")}
                >
                  ADD LLM API
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t border-zinc-800">
        <p className="text-xs text-zinc-500">© 2026 ChatAgent. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link className="text-xs hover:underline underline-offset-4 text-zinc-500 hover:text-zinc-300" href="#">
            Terms of Service
          </Link>
          <Link className="text-xs hover:underline underline-offset-4 text-zinc-500 hover:text-zinc-300" href="#">
            Privacy
          </Link>
        </nav>
      </footer>
    </div>
  );
}
