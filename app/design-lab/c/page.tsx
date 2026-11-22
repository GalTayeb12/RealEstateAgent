import { pickLang } from "../_c/content";
import { CHome } from "../_c/c";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <CHome lang={pickLang((await searchParams).lang)} />; }
