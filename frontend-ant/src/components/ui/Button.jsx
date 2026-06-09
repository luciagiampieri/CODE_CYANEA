export default function Button({
  children,
  className = "",
  variant = "primary",
  type = "button",
  ...props
}) {
  const classes = ["button", `button--${variant}`, className].filter(Boolean).join(" ");
  return (
    <button className={classes} type={type} {...props}>
      {children}
    </button>
  );
}
