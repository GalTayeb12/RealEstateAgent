import { pickLang } from "../_c/content";
import { BHome } from "../_c/b";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <BHome lang={pickLang((await searchParams).lang)} />; }
