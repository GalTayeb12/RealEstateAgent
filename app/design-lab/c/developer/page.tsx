import { pickLang } from "../../_c/content";
import { CDeveloper } from "../../_c/c";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <CDeveloper lang={pickLang((await searchParams).lang)} />; }
