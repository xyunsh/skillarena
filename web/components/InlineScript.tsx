/** Plain inline script, rendered into the static HTML and run on page load (pages use full navigations). */
export function InlineScript({ code }: { code: string }) {
    return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
