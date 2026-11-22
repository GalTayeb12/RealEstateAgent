import { pickLang } from "../../_c/content";
import { BResults } from "../../_c/b";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <BResults lang={pickLang((await searchParams).lang)} />; }
