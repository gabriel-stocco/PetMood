import { useMemo, useState } from 'react';
import { Check, Copy, Play, RotateCcw } from 'lucide-react';

interface GreetingLocale {
  id: string;
  label: string;
  nativeName: string;
  prefix: string;
  defaultTarget: string;
  suffix: string;
  note: string;
}

interface CodeExample {
  id: string;
  name: string;
  filename: string;
  year: string;
  render: (message: string) => string;
}

const LOCALES: GreetingLocale[] = [
  {
    id: 'en',
    label: 'Inglês',
    nativeName: 'English',
    prefix: 'Hello, ',
    defaultTarget: 'World',
    suffix: '!',
    note: 'A forma clássica popularizada por Brian Kernighan nos anos 1970.',
  },
  {
    id: 'pt',
    label: 'Português',
    nativeName: 'Português',
    prefix: 'Olá, ',
    defaultTarget: 'Mundo',
    suffix: '!',
    note: 'A primeira frase que quase todo programador lusófono escreve no terminal.',
  },
  {
    id: 'es',
    label: 'Espanhol',
    nativeName: 'Español',
    prefix: '¡Hola, ',
    defaultTarget: 'Mundo',
    suffix: '!',
    note: 'Saudação tradicional usada em tutoriais de programação em espanhol.',
  },
  {
    id: 'fr',
    label: 'Francês',
    nativeName: 'Français',
    prefix: 'Bonjour, ',
    defaultTarget: 'le Monde',
    suffix: ' !',
    note: 'Versão francesa clássica para testar a primeira saída de um programa.',
  },
  {
    id: 'de',
    label: 'Alemão',
    nativeName: 'Deutsch',
    prefix: 'Hallo, ',
    defaultTarget: 'Welt',
    suffix: '!',
    note: 'Forma concisa adotada na documentação técnica em língua alemã.',
  },
  {
    id: 'ja',
    label: 'Japonês',
    nativeName: '日本語',
    prefix: 'こんにちは、',
    defaultTarget: '世界',
    suffix: '！',
    note: 'Excelente teste também para confirmar suporte completo a UTF-8.',
  },
];

function escapeDoubleQuotes(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const CODE_EXAMPLES: CodeExample[] = [
  {
    id: 'ts',
    name: 'TypeScript',
    filename: 'hello.ts',
    year: '2012',
    render: (msg) =>
      `const greeting: string = "${escapeDoubleQuotes(msg)}";\nconsole.log(greeting);`,
  },
  {
    id: 'py',
    name: 'Python',
    filename: 'hello.py',
    year: '1991',
    render: (msg) => `print("${escapeDoubleQuotes(msg)}")`,
  },
  {
    id: 'c',
    name: 'C',
    filename: 'hello.c',
    year: '1972',
    render: (msg) =>
      `#include <stdio.h>\n\nint main(void) {\n  printf("${escapeDoubleQuotes(msg)}\\n");\n  return 0;\n}`,
  },
  {
    id: 'rust',
    name: 'Rust',
    filename: 'main.rs',
    year: '2010',
    render: (msg) =>
      `fn main() {\n    println!("${escapeDoubleQuotes(msg)}");\n}`,
  },
  {
    id: 'go',
    name: 'Go',
    filename: 'main.go',
    year: '2009',
    render: (msg) =>
      `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("${escapeDoubleQuotes(msg)}")\n}`,
  },
  {
    id: 'html',
    name: 'HTML',
    filename: 'index.html',
    year: '1993',
    render: (msg) => `<!doctype html>\n<h1>${escapeHtml(msg)}</h1>`,
  },
];

export default function App() {
  const [localeId, setLocaleId] = useState<string>('en');
  const [customTarget, setCustomTarget] = useState<string>('');
  const [codeLangId, setCodeLangId] = useState<string>('ts');
  const [copiedKey, setCopiedKey] = useState<'greeting' | 'code' | null>(null);
  const [outputLines, setOutputLines] = useState<string[]>([
    'Hello, World!',
  ]);

  const activeLocale = useMemo(
    () => LOCALES.find((item) => item.id === localeId) ?? LOCALES[0],
    [localeId],
  );

  const activeCode = useMemo(
    () => CODE_EXAMPLES.find((item) => item.id === codeLangId) ?? CODE_EXAMPLES[0],
    [codeLangId],
  );

  const trimmedTarget = customTarget.trim();
  const displayTarget = trimmedTarget.length > 0 ? trimmedTarget : activeLocale.defaultTarget;
  const fullGreeting = `${activeLocale.prefix}${displayTarget}${activeLocale.suffix}`;
  const renderedCode = useMemo(
    () => activeCode.render(fullGreeting),
    [activeCode, fullGreeting],
  );

  const handleCopy = async (text: string, key: 'greeting' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1800);
  };

  const handleRun = () => {
    setOutputLines((prev) => [...prev.slice(-3), fullGreeting]);
  };

  const handleReset = () => {
    setLocaleId('en');
    setCustomTarget('');
    setOutputLines(['Hello, World!']);
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#09090B] flex flex-col">
      <header className="sticky top-0 z-20 bg-[#FAFAFA]/90 backdrop-blur-md border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="#saudacao"
            className="font-display text-lg font-bold tracking-tight text-zinc-950 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-sm"
          >
            Hello, World!
          </a>

          <nav
            aria-label="Navegação principal"
            className="hidden sm:flex items-center gap-7 text-sm font-medium text-zinc-600"
          >
            <a
              href="#saudacao"
              className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
            >
              Saudação
            </a>
            <a
              href="#idiomas"
              className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
            >
              Idiomas
            </a>
            <a
              href="#codigo"
              className="hover:text-zinc-950 transition-colors whitespace-nowrap shrink-0"
            >
              Em código
            </a>
          </nav>

          <button
            type="button"
            onClick={() => handleCopy(fullGreeting, 'greeting')}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] active:scale-[0.98] rounded-lg transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
          >
            {copiedKey === 'greeting' ? (
              <>
                <Check className="w-4 h-4" aria-hidden="true" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" aria-hidden="true" />
                <span>Copiar saudação</span>
              </>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 sm:px-8 py-14 sm:py-20 space-y-16 sm:space-y-20">
        <section id="saudacao" className="scroll-mt-24">
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-zinc-500 mb-6">
            <span>Primeiro programa</span>
            <span aria-hidden="true">·</span>
            <span>{activeLocale.label}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{fullGreeting.length} caracteres</span>
          </div>

          <h1 className="font-display font-bold tracking-tight text-zinc-950 leading-[1.04] max-w-4xl text-[clamp(2.75rem,7vw,5.25rem)] text-balance">
            {fullGreeting}
          </h1>

          <p className="mt-6 text-base sm:text-lg text-zinc-600 max-w-2xl leading-relaxed">
            {activeLocale.note}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row sm:items-end gap-4 max-w-xl">
            <div className="flex-1">
              <label
                htmlFor="target-input"
                className="block text-sm font-medium text-zinc-700 mb-2"
              >
                Personalizar destinatário
              </label>
              <input
                id="target-input"
                type="text"
                value={customTarget}
                onChange={(event) => setCustomTarget(event.target.value)}
                placeholder={activeLocale.defaultTarget}
                maxLength={40}
                className="w-full h-11 px-4 rounded-lg bg-white border border-zinc-300 text-zinc-950 placeholder:text-zinc-400 text-sm focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 transition-colors"
              />
            </div>

            {(customTarget.length > 0 || localeId !== 'en') && (
              <button
                type="button"
                onClick={handleReset}
                className="h-11 px-4 inline-flex items-center justify-center gap-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
                <span>Restaurar</span>
              </button>
            )}
          </div>
        </section>

        <section id="idiomas" className="scroll-mt-24 pt-12 border-t border-zinc-200">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-6">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-zinc-950">
              Escolha um idioma
            </h2>
            <p className="text-sm text-zinc-500">
              A saudação e os exemplos de código atualizam em tempo real.
            </p>
          </div>

          <div
            role="group"
            aria-label="Idiomas disponíveis"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
          >
            {LOCALES.map((locale) => {
              const isSelected = locale.id === activeLocale.id;
              return (
                <button
                  key={locale.id}
                  type="button"
                  onClick={() => setLocaleId(locale.id)}
                  aria-pressed={isSelected}
                  className={`px-4 py-3 text-left rounded-xl border transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                    isSelected
                      ? 'bg-zinc-950 text-white border-zinc-950'
                      : 'bg-white text-zinc-800 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  <div className="text-sm font-semibold whitespace-nowrap truncate">
                    {locale.label}
                  </div>
                  <div
                    className={`text-xs mt-0.5 whitespace-nowrap truncate ${
                      isSelected ? 'text-zinc-300' : 'text-zinc-500'
                    }`}
                  >
                    {locale.nativeName}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section id="codigo" className="scroll-mt-24 pt-12 border-t border-zinc-200">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-6">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-zinc-950">
              Em diferentes linguagens
            </h2>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="font-mono">{activeCode.filename}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">Criada em {activeCode.year}</span>
            </div>
          </div>

          <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
            <div className="px-4 sm:px-6 py-3 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3">
              <div
                role="tablist"
                aria-label="Linguagens de programação"
                className="flex items-center gap-1 overflow-x-auto"
              >
                {CODE_EXAMPLES.map((lang) => {
                  const isActive = lang.id === activeCode.id;
                  return (
                    <button
                      key={lang.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setCodeLangId(lang.id)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                        isActive
                          ? 'bg-zinc-950 text-white'
                          : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-100'
                      }`}
                    >
                      {lang.name}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleCopy(renderedCode, 'code')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  {copiedKey === 'code' ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleRun}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#2563EB] hover:bg-[#1D4ED8] rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
                >
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Executar</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
              <div className="lg:col-span-7 p-6 bg-zinc-50/70 overflow-x-auto">
                <pre className="font-mono text-sm leading-7 text-zinc-900">
                  <code>{renderedCode}</code>
                </pre>
              </div>

              <div className="lg:col-span-5 p-6 flex flex-col justify-between bg-white">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-xs font-medium text-zinc-500">Saída padrão</span>
                    {outputLines.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOutputLines([])}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Limpar
                      </button>
                    )}
                  </div>

                  {outputLines.length === 0 ? (
                    <p className="font-mono text-sm text-zinc-400">
                      Clique em Executar para imprimir a saudação.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 font-mono text-sm text-zinc-900">
                      {outputLines.map((line, index) => (
                        <li key={`${line}-${index}`} className="flex items-baseline gap-3">
                          <span className="text-xs text-zinc-400 select-none tabular-nums">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="break-all">{line}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-200 mt-auto">
        <div className="max-w-5xl mx-auto px-6 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
          <span>Hello, World!</span>
          <span>O ponto de partida clássico da programação.</span>
        </div>
      </footer>
    </div>
  );
}
