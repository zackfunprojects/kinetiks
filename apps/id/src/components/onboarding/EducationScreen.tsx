"use client";

interface EducationScreenProps {
  fromApp: string | null;
  codename: string;
  onContinue: () => void;
}

const APP_FRAMING: Record<string, { heading: string; body: string }> = {
  dark_madder: {
    heading: "Dark Madder is powered by Kinetiks",
    body: "We're going to spend about 15 minutes learning your business so everything we create sounds like you. Your Kinetiks ID also powers other growth tools you can activate later.",
  },
  harvest: {
    heading: "Harvest is powered by Kinetiks",
    body: "We're going to learn your business so your outreach hits the right people with the right message. Your Kinetiks ID also powers other growth tools you can activate later.",
  },
  hypothesis: {
    heading: "Hypothesis is powered by Kinetiks",
    body: "We're going to learn your business so every landing page converts. Your Kinetiks ID also powers other growth tools you can activate later.",
  },
  litmus: {
    heading: "Litmus is powered by Kinetiks",
    body: "We're going to learn your business so your PR lands with the right journalists. Your Kinetiks ID also powers other growth tools you can activate later.",
  },
};

const DEFAULT_FRAMING = {
  heading: "Welcome to Kinetiks",
  body: "Build your business identity once, and it powers every tool in the ecosystem. We'll spend about 15 minutes learning your business - your voice, your customers, your story.",
};

export function EducationScreen({
  fromApp,
  codename,
  onContinue,
}: EducationScreenProps) {
  const framing = fromApp ? APP_FRAMING[fromApp] ?? DEFAULT_FRAMING : DEFAULT_FRAMING;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-12 text-center shadow-sm">
        <div className="mb-6 inline-block rounded-full bg-[#f0eeff] px-4 py-1.5 text-sm font-semibold text-[#6C5CE7]">
          {codename}
        </div>

        <h1 className="text-2xl font-bold text-gray-900">{framing.heading}</h1>

        <p className="mt-3 text-[15px] leading-relaxed text-gray-500">
          {framing.body}
        </p>

        <div className="mt-10">
          <button
            onClick={onContinue}
            className="rounded-lg bg-[#6C5CE7] px-8 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#5b4bd6]"
          >
            Let's get started
          </button>
        </div>
      </div>
    </div>
  );
}
