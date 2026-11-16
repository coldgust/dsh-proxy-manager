/** The bundle ships styles as text, injected by the page component. */
declare module '*.css' {
  const content: string
  export default content
}
