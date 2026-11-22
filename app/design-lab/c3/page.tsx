import { pickLang } from "../_c/content";
import { C3Home } from "../_c3/c3";
export default async function P({ searchParams }: { searchParams: Promise<{ lang?: string }> }) { return <C3Home lang={pickLang((await searchParams).lang)} />; }
