import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, CircleHelp, X } from "lucide-react";

export type PageGuideStep = {
  targetId: string;
  title: string;
  description: string;
};

type PageGuideProps = {
  label: string;
  steps: PageGuideStep[];
};

export function PageGuide({ label, steps }: PageGuideProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeStep = steps[activeIndex];

  useEffect(() => {
    if (!isOpen || !activeStep) return;

    const target = document.querySelector<HTMLElement>(`[data-guide-id="${activeStep.targetId}"]`);
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("page-guide-highlight");

    return () => {
      target.classList.remove("page-guide-highlight");
    };
  }, [activeStep, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  if (steps.length === 0) return null;

  const openGuide = () => {
    setActiveIndex(0);
    setIsOpen(true);
  };

  const closeGuide = () => {
    setIsOpen(false);
  };

  const goBack = () => {
    setActiveIndex((current) => Math.max(0, current - 1));
  };

  const goNext = () => {
    if (activeIndex >= steps.length - 1) {
      closeGuide();
      return;
    }

    setActiveIndex((current) => Math.min(steps.length - 1, current + 1));
  };

  return (
    <>
      <button
        type="button"
        onClick={openGuide}
        aria-label={`Open ${label} guide`}
        title={`${label} guide`}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#E31937]"
      >
        <CircleHelp className="h-5 w-5" />
      </button>

      {isOpen && activeStep ? (
        <div className="fixed bottom-5 right-5 z-[70] w-[min(calc(100vw-2rem),24rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase text-[#B5122B]">
                {label} guide {activeIndex + 1} of {steps.length}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">{activeStep.title}</h2>
            </div>
            <button
              type="button"
              onClick={closeGuide}
              aria-label="Close guide"
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-3 text-sm leading-6 text-gray-600">{activeStep.description}</p>

          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-[#E31937] transition-all"
              style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }}
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={activeIndex === 0}
              aria-label="Previous guide step"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#E31937] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c41230]"
            >
              {activeIndex >= steps.length - 1 ? "Done" : "Next"}
              {activeIndex < steps.length - 1 ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
