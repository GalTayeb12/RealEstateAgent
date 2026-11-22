import { pickLang } from "../_c/content";
import { AHome } from "../_c/a";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <AHome lang={pickLang((await searchParams).lang)} />; }
