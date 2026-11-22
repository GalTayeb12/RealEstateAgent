import { pickLang } from "../../_c/content";
import { CResults } from "../../_c/c";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <CResults lang={pickLang((await searchParams).lang)} />; }
