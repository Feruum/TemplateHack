from agent.prompts.system import SYSTEM_PROMPT


def test_system_prompt_disables_nemotron_reasoning_first():
    assert SYSTEM_PROMPT.startswith("/no_think\n")


def test_system_prompt_omits_unsupported_follow_up_components():
    assert "FollowUpBlock" not in SYSTEM_PROMPT
    assert "FollowUpItem" not in SYSTEM_PROMPT


def test_system_prompt_forbids_angle_wrapped_openui_programs():
    assert "Never wrap the OpenUI program in angle brackets" in SYSTEM_PROMPT
    assert (
        "The first visible character of every response must be `r` from `root`"
        in SYSTEM_PROMPT
    )
