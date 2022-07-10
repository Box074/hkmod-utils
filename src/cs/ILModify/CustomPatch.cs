
public static partial class Program
{
    public static Dictionary<string, Assembly> assemblys = new();
    public static void CheckCP(object member, IEnumerable<CustomAttribute> attrs)
    {
        var attr = attrs.FirstOrDefault(x => x.AttributeType.FullName == "HKTool.Patcher.CustomPatcherAttribute");
        if (attr is null) return;

        var type = (TypeReference)attr.ConstructorArguments[0].Value;
        var ass = type.Resolve().Module.Assembly;
        if (!assemblys.TryGetValue(ass.Name.Name, out var mass))
        {
            return;
        }
        var mt = mass.GetType(type.FullName, false);
        if (mt is null) return;

        var m = mt.GetMethod((string)attr.ConstructorArguments[1].Value, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
        if (m is null) throw new MissingMethodException(mt.FullName, (string)attr.ConstructorArguments[1].Value);
        m.Invoke(null, new object[] { member });
    }
    public static void CheckCUP(MemberReference mr, MethodDefinition caller, Instruction il, object other)
    {
        if (mr is null) return;
        var attr = mr.Resolve()?.CustomAttributes?.FirstOrDefault(x => x.AttributeType.FullName == "HKTool.Patcher.PatchCallerAttribute");
        if (attr is null) return;

        var type = (TypeReference)attr.ConstructorArguments[0].Value;
        var ass = type.Resolve().Module.Assembly;
        if (ass == null) return;
        if (!assemblys.TryGetValue(ass.Name.Name, out var mass))
        {
            return;
        }
        var mt = mass.GetType(type.FullName, false);
        if (mt is null) return;

        var m = mt.GetMethod((string)attr.ConstructorArguments[1].Value, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
        if (m is null) throw new MissingMethodException(mt.FullName, (string)attr.ConstructorArguments[1].Value);
        switch (m.GetParameters().Length)
        {
            case 2:
                m.Invoke(null, new object[] { caller, il });
                break;
            case 3:
                m.Invoke(null, new object[] { mr, caller, il });
                break;
            case 4:
                m.Invoke(null, new object[] { mr, caller, il, other });
                break;
        }
    }
}
